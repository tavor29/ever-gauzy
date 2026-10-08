FROM python:3.11-slim

ARG EMBEDDING_MODEL=BAAI/bge-small-en-v1.5
ENV PYTHONUNBUFFERED=1 HF_HOME=/opt/hf

WORKDIR /srv
COPY requirements.txt .
# CPU-only torch keeps the image small; embeddings for short PM text are fast on CPU.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir -r requirements.txt

# Download the embedding model at build time. At runtime HF_HUB_OFFLINE=1 and the
# container has no internet route, so nothing is fetched after deployment.
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('${EMBEDDING_MODEL}')"

COPY app ./app
RUN useradd -r -u 10001 rag && chown -R rag /srv /opt/hf
USER rag

EXPOSE 8088
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8088", "--workers", "1"]
