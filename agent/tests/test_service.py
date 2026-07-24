import unittest

from lumora_agent.service import (
    AuthenticationError,
    ProtocolMismatchError,
    validate_request_context,
)


class RequestContextValidationTest(unittest.TestCase):
    def test_rejects_wrong_startup_token(self) -> None:
        with self.assertRaises(AuthenticationError):
            validate_request_context(
                protocol_version="1",
                startup_token="wrong",
                expected_protocol_version="1",
                expected_startup_token="correct",
            )

    def test_rejects_incompatible_protocol_version(self) -> None:
        with self.assertRaises(ProtocolMismatchError):
            validate_request_context(
                protocol_version="2",
                startup_token="correct",
                expected_protocol_version="1",
                expected_startup_token="correct",
            )

    def test_accepts_matching_context(self) -> None:
        validate_request_context(
            protocol_version="1",
            startup_token="correct",
            expected_protocol_version="1",
            expected_startup_token="correct",
        )


if __name__ == "__main__":
    unittest.main()
