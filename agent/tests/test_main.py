import json
import unittest

from app.main import format_ready_event


class ReadyEventTest(unittest.TestCase):
    def test_formats_machine_readable_ready_event(self) -> None:
        line = format_ready_event(45123)
        prefix, payload = line.split(" ", 1)
        self.assertEqual(prefix, "LUMORA_READY")
        self.assertEqual(
            json.loads(payload),
            {"service": "agent", "port": 45123},
        )
