"""QLoRA fine-tuning of Mistral-7B-Instruct on project-management instructions.

Usage:
    python train_mistral.py --data data/pm_train.jsonl --eval data/pm_eval.jsonl
    python train_mistral.py --merge-only --adapter out/adapter   # just merge an existing adapter

Dataset (JSONL), one example per line, either format:
    {"messages": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}
    {"instruction": "...", "input": "...", "output": "..."}

Outputs:
    out/adapter/   LoRA adapter weights
    out/merged/    full fp16 model with the adapter merged in (input to export_gguf.sh)
"""

import argparse
import inspect
import json
from pathlib import Path

import torch
from datasets import load_dataset
from peft import LoraConfig, PeftModel, prepare_model_for_kbit_training
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from trl import SFTConfig, SFTTrainer

DEFAULT_BASE = "mistralai/Mistral-7B-Instruct-v0.3"  # or a local path to downloaded weights


def to_messages(example: dict) -> dict:
    """Normalise both dataset formats to chat messages. Mistral has no system role,
    so a system message is folded into the first user turn."""
    if "messages" in example:
        msgs = example["messages"]
    else:
        user = example["instruction"]
        if example.get("input"):
            user = f"{user}\n\n{example['input']}"
        msgs = [{"role": "user", "content": user}, {"role": "assistant", "content": example["output"]}]
    if msgs and msgs[0]["role"] == "system":
        sys_text, msgs = msgs[0]["content"], msgs[1:]
        msgs[0] = {"role": "user", "content": f"{sys_text}\n\n{msgs[0]['content']}"}
    return {"messages": msgs}


def kwarg_name(cls, *candidates: str) -> str:
    """trl renamed several arguments across versions; pick whichever this install accepts."""
    params = inspect.signature(cls.__init__).parameters
    return next(c for c in candidates if c in params)


def train(args) -> Path:
    tok = AutoTokenizer.from_pretrained(args.base, use_fast=True)
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token
    tok.padding_side = "right"

    bnb = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
        bnb_4bit_compute_dtype=torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16,
    )
    model = AutoModelForCausalLM.from_pretrained(
        args.base, quantization_config=bnb, device_map="auto", torch_dtype=torch.bfloat16
    )
    model.config.use_cache = False
    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)

    lora = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_r * 2,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    )

    files = {"train": args.data}
    if args.eval:
        files["eval"] = args.eval
    ds = load_dataset("json", data_files=files)
    ds = ds.map(to_messages, remove_columns=[c for c in ds["train"].column_names if c != "messages"])

    out = Path(args.out)
    cfg_kwargs = dict(
        output_dir=str(out / "checkpoints"),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.lr,
        lr_scheduler_type="cosine",
        warmup_ratio=0.03,
        logging_steps=10,
        save_strategy="epoch",
        eval_strategy="epoch" if args.eval else "no",
        bf16=torch.cuda.is_bf16_supported(),
        fp16=not torch.cuda.is_bf16_supported(),
        gradient_checkpointing=True,
        optim="paged_adamw_8bit",
        report_to="none",  # no external experiment trackers: stays off-grid
    )
    cfg_kwargs[kwarg_name(SFTConfig, "max_length", "max_seq_length")] = args.max_len
    cfg = SFTConfig(**cfg_kwargs)

    trainer_kwargs = dict(
        model=model,
        args=cfg,
        train_dataset=ds["train"],
        eval_dataset=ds.get("eval"),
        peft_config=lora,
    )
    trainer_kwargs[kwarg_name(SFTTrainer, "processing_class", "tokenizer")] = tok
    trainer = SFTTrainer(**trainer_kwargs)
    trainer.train()

    adapter_dir = out / "adapter"
    trainer.model.save_pretrained(adapter_dir)
    tok.save_pretrained(adapter_dir)
    (adapter_dir / "train_args.json").write_text(json.dumps(vars(args), indent=2))
    return adapter_dir


def merge(base: str, adapter_dir: Path, merged_dir: Path) -> None:
    """Merging needs the base in fp16/bf16, not 4-bit, so it is reloaded here (~15 GB RAM)."""
    base_model = AutoModelForCausalLM.from_pretrained(base, torch_dtype=torch.float16, device_map="cpu")
    merged = PeftModel.from_pretrained(base_model, adapter_dir).merge_and_unload()
    merged.save_pretrained(merged_dir, safe_serialization=True)
    AutoTokenizer.from_pretrained(adapter_dir).save_pretrained(merged_dir)
    print(f"merged model written to {merged_dir}; next: ./export_gguf.sh {merged_dir}")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--base", default=DEFAULT_BASE)
    p.add_argument("--data", default="data/pm_train.jsonl")
    p.add_argument("--eval", default=None)
    p.add_argument("--out", default="out")
    p.add_argument("--epochs", type=float, default=3)
    p.add_argument("--batch-size", type=int, default=2)
    p.add_argument("--grad-accum", type=int, default=8)
    p.add_argument("--lr", type=float, default=2e-4)
    p.add_argument("--max-len", type=int, default=2048)
    p.add_argument("--lora-r", type=int, default=16)
    p.add_argument("--merge-only", action="store_true")
    p.add_argument("--adapter", default=None)
    args = p.parse_args()

    adapter_dir = Path(args.adapter) if args.merge_only else train(args)
    merge(args.base, adapter_dir, Path(args.out) / "merged")


if __name__ == "__main__":
    main()
