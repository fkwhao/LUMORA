from http import HTTPMethod

from fastapi import APIRouter, Header, status

from app.constants.api_paths import MODELS_ROUTE
from app.constants.error_codes import INVALID_REQUEST, MODEL_PROVIDER_ERROR
from app.constants.http_contract import (
    AUTHORIZATION_HEADER,
    CORRELATION_ID_HEADER,
    PROTOCOL_VERSION_HEADER,
)
from app.controller.http.errors import AgentHttpError
from app.controller.http.request_guard import HttpRequestGuard
from app.dto.request.model_list_request import ModelListRequest
from app.dto.response.model_list_response import ModelListResponse
from app.exception.provider_errors import ModelProviderError
from app.service.chat_service import ChatService


class ModelRoutes:
    def __init__(self, chat_service: ChatService, guard: HttpRequestGuard) -> None:
        self.router = APIRouter()
        self._chat_service = chat_service
        self._guard = guard
        self.router.add_api_route(
            MODELS_ROUTE,
            self.list_models,
            methods=[HTTPMethod.POST],
            response_model=ModelListResponse,
        )

    async def list_models(
        self,
        request: ModelListRequest,
        authorization: str | None = Header(default=None, alias=AUTHORIZATION_HEADER),
        protocol_version: str | None = Header(default=None, alias=PROTOCOL_VERSION_HEADER),
        correlation_id: str | None = Header(default=None, alias=CORRELATION_ID_HEADER),
    ) -> ModelListResponse:
        authenticated_id = self._guard.authenticate(
            authorization, protocol_version, correlation_id
        )
        try:
            return ModelListResponse(
                models=await self._chat_service.list_models(request)
            )
        except ValueError as error:
            raise AgentHttpError(
                status.HTTP_400_BAD_REQUEST,
                INVALID_REQUEST,
                str(error),
                False,
                authenticated_id,
            ) from error
        except ModelProviderError as error:
            raise AgentHttpError(
                status.HTTP_502_BAD_GATEWAY,
                MODEL_PROVIDER_ERROR,
                str(error),
                True,
                authenticated_id,
            ) from error
