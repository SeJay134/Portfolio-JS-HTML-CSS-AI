"""Stateless portfolio API. Importing this module never loads a model or index."""
from __future__ import annotations

import logging
import os
import threading
import uuid

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.exceptions import HTTPException

load_dotenv()
log = logging.getLogger(__name__)


def create_app(config: dict | None = None, service=None) -> Flask:
    app = Flask(__name__, static_folder=None)
    app.config.from_mapping(
        MAX_CONTENT_LENGTH=16 * 1024,
        FRONTEND_URLS=os.getenv("FRONTEND_URLS", "http://localhost:5001,http://127.0.0.1:5001"),
        RATELIMIT_STORAGE_URI=os.getenv("RATELIMIT_STORAGE_URI", "memory://"),
        CHAT_LIMIT=os.getenv("CHAT_LIMIT", "10/minute"),
        MODEL_NAME=os.getenv("MODEL_NAME", "qwen2.5:7b"),
        OLLAMA_HOST=os.getenv("OLLAMA_HOST", "http://localhost:11434"),
        MODEL_TIMEOUT=float(os.getenv("MODEL_TIMEOUT", "45")),
        MAX_GENERATIONS=int(os.getenv("MAX_GENERATIONS", "1")),
    )
    if config:
        app.config.update(config)
    origins = [s.strip() for s in app.config["FRONTEND_URLS"].split(",") if s.strip()]
    CORS(app, origins=origins, methods=["GET", "POST"], allow_headers=["Content-Type"],
         expose_headers=["Retry-After", "X-Request-ID"])
    @app.before_request
    def identify_request():
        request.request_id = uuid.uuid4().hex

    limiter = Limiter(get_remote_address, app=app, default_limits=["60/minute"])
    app.extensions["portfolio_limiter"] = limiter
    gate = threading.BoundedSemaphore(app.config["MAX_GENERATIONS"])
    service_lock = threading.Lock()
    holder = [service]

    def get_service():
        with service_lock:
            if holder[0] is None:
                from llm.service import PortfolioService
                holder[0] = PortfolioService(app.config)
            return holder[0]

    @app.after_request
    def headers(response):
        response.headers["X-Request-ID"] = request.request_id
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    def error(message: str, status: int):
        response = jsonify(error=message, request_id=request.request_id)
        response.status_code = status
        if status in (429, 503):
            response.headers["Retry-After"] = "10" if status == 503 else "60"
        return response

    @app.errorhandler(HTTPException)
    def http_error(exc):
        messages = {400: "Invalid request.", 404: "Not found.", 405: "Method not allowed.",
                    413: "Request body is too large.", 429: "Too many requests. Please try again later."}
        return error(messages.get(exc.code, "Request failed."), exc.code)

    @app.get("/health")
    def health():
        return jsonify(status="ok", history="stateless")

    @app.get("/ready")
    @limiter.limit("12/minute")
    def ready():
        try:
            if get_service().ready():
                return jsonify(status="ready")
        except Exception:
            log.warning("Readiness unavailable request_id=%s", request.request_id)
        return error("Assistant is offline. Projects and contact remain available.", 503)

    @app.post("/chat")
    @limiter.limit(lambda: app.config["CHAT_LIMIT"])
    def chat():
        data = request.get_json(silent=True)
        if not isinstance(data, dict) or not isinstance(data.get("message"), str):
            return error("Provide a JSON object with a string message.", 400)
        message = data["message"].strip()
        if not message or len(message) > 300:
            return error("Message must contain 1 to 300 characters.", 400)
        if not gate.acquire(blocking=False):
            return error("Assistant is busy. Please try again shortly.", 503)
        try:
            # Only the current message crosses this boundary. No shared conversation state.
            result = get_service().answer(message)
            if not isinstance(result, dict) or not isinstance(result.get("reply"), str) or not result["reply"].strip():
                raise ValueError("Invalid model response")
            return jsonify(reply=result["reply"], sources=result.get("sources", []),
                           request_id=request.request_id)
        except Exception:
            log.warning("Generation failed request_id=%s", request.request_id)
            return error("Assistant is unavailable. Please try again or use Contact.", 503)
        finally:
            gate.release()

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5002)
