import json
import os
import tempfile
from pathlib import Path
from threading import RLock
from typing import Any


class MetadataStore:
    """Mongo metadata store with a local JSON fallback for offline development."""
    def __init__(self, storage: Path):
        self.path = storage / "metadata.json"
        self.lock = RLock()
        self.collection = None
        uri = os.getenv("MONGODB_URI", "").strip()
        if uri:
            try:
                from pymongo import MongoClient
                client = MongoClient(uri, serverSelectionTimeoutMS=1200)
                client.admin.command("ping")
                self.collection = client[os.getenv("MONGODB_DATABASE", "datarefinery")]["datasets"]
            except Exception:
                self.collection = None

    def all(self) -> list[dict[str, Any]]:
        if self.collection is not None:
            return list(self.collection.find({}, {"_id": False}).sort("created_at", -1))
        with self.lock:
            if not self.path.exists():
                return []
            try:
                return json.loads(self.path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                return []

    def get(self, dataset_id: str) -> dict[str, Any] | None:
        if self.collection is not None:
            return self.collection.find_one({"dataset_id": dataset_id}, {"_id": False})
        return next((item for item in self.all() if item.get("dataset_id") == dataset_id), None)

    def put(self, item: dict[str, Any]) -> None:
        if self.collection is not None:
            self.collection.replace_one({"dataset_id": item["dataset_id"]}, item, upsert=True)
            return
        with self.lock:
            items = self.all()
            replaced = False
            for index, current in enumerate(items):
                if current.get("dataset_id") == item["dataset_id"]:
                    items[index] = item
                    replaced = True
                    break
            if not replaced:
                items.insert(0, item)
            self.path.parent.mkdir(parents=True, exist_ok=True)
            fd, temp_name = tempfile.mkstemp(dir=self.path.parent, suffix=".tmp")
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as stream:
                    json.dump(items, stream, ensure_ascii=False, default=str)
                os.replace(temp_name, self.path)
            finally:
                if os.path.exists(temp_name):
                    os.unlink(temp_name)
