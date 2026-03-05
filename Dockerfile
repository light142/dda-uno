FROM python:3.11-slim

WORKDIR /app

# Shared core (agents, controller, config)
COPY engine/ ./engine/

# API code + bundled models
COPY api/ ./api/

WORKDIR /app/api
RUN pip install --no-cache-dir -r requirements.txt

ENV PYTHONPATH=/app
EXPOSE 7860
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
