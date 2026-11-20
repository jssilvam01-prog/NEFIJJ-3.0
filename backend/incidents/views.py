import mimetypes

from django.db import transaction
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status, viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from accounts.models import Organization, OrganizationMembership
from accounts.tenancy import (
    active_organization_admin_ids,
    has_active_location_membership,
)
from .models import (
    Category,
    CategoryTechnician,
    Incident,
    IncidentEvent,
    IncidentNotification,
)
from .serializers import (
    CategorySerializer,
    CategoryTechnicianSerializer,
    IncidentAssignmentSerializer,
    IncidentCreateSerializer,
    IncidentNotificationSerializer,
    IncidentReadSerializer,
    IncidentStatusSerializer,
)


def incidents_visible_to(user):
    incidents = Incident.objects.select_related(
        'organization',
        'location',
        'category',
        'reported_by',
        'assigned_to',
    ).prefetch_related('events__actor')
    role = user.effective_role
    if role == 'superadmin':
        return incidents
    if role == 'organization_admin':
        return incidents.filter(
            organization_id__in=active_organization_admin_ids(user),
            organization__status=Organization.Status.ACTIVE,
            location__is_active=True,
        )
    if role == 'technician' and has_active_location_membership(
        user,
        OrganizationMembership.Role.TECHNICIAN,
    ):
        return incidents.filter(
            organization_id=user.location.organization_id,
            location_id=user.location_id,
            organization__status=Organization.Status.ACTIVE,
            location__is_active=True,
        )
    if role == 'user' and has_active_location_membership(
        user,
        OrganizationMembership.Role.USER,
    ):
        return incidents.filter(
            reported_by_id=user.pk,
            organization_id=user.location.organization_id,
            location_id=user.location_id,
            organization__status=Organization.Status.ACTIVE,
            location__is_active=True,
        )
    return incidents.none()


class CategoryViewSet(viewsets.ModelViewSet):
    serializer_class = CategorySerializer
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        user = self.request.user
        categories = Category.objects.select_related('organization')
        role = user.effective_role
        if role == 'superadmin':
            return categories.filter(organization__status=Organization.Status.ACTIVE)
        if role == 'organization_admin':
            return categories.filter(
                organization_id__in=active_organization_admin_ids(user),
                organization__status=Organization.Status.ACTIVE,
            )
        membership_role = {
            'user': OrganizationMembership.Role.USER,
            'technician': OrganizationMembership.Role.TECHNICIAN,
        }.get(role)
        if membership_role and has_active_location_membership(user, membership_role):
            return categories.filter(
                organization_id=user.location.organization_id,
                organization__status=Organization.Status.ACTIVE,
                is_active=True,
            )
        return categories.none()

    @transaction.atomic
    @transaction.atomic
    def perform_create(self, serializer):
        if self.request.user.effective_role != 'organization_admin':
            raise PermissionDenied('Solo un administrador puede crear categorías.')
        serializer.save()

    def perform_update(self, serializer):
        if self.request.user.effective_role != 'organization_admin':
            raise PermissionDenied('Solo un administrador puede editar categorías.')
        if not active_organization_admin_ids(self.request.user).filter(
            organization_id=serializer.instance.organization_id,
        ).exists():
            raise PermissionDenied('No puedes modificar categorías de otra organización.')
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        raise PermissionDenied('Las categorías se desactivan; no se eliminan.')


class CategoryTechnicianRoutesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_category(self, request, category_id):
        if request.user.effective_role != 'organization_admin':
            raise PermissionDenied('Solo un administrador puede gestionar el enrutamiento.')
        return get_object_or_404(
            Category.objects.filter(
                organization_id__in=active_organization_admin_ids(request.user),
                organization__status=Organization.Status.ACTIVE,
            ),
            pk=category_id,
        )

    def get(self, request, category_id):
        category = self.get_category(request, category_id)
        routes = CategoryTechnician.objects.filter(
            category=category,
            location__is_active=True,
            technician__is_active=True,
        ).select_related('location', 'technician').order_by('location__name')
        return Response([
            {
                'location_id': route.location_id,
                'location_name': route.location.name,
                'technician_id': route.technician_id,
                'technician_username': route.technician.username,
            }
            for route in routes
        ])

    def post(self, request, category_id):
        category = self.get_category(request, category_id)
        serializer = CategoryTechnicianSerializer(
            data=request.data,
            context={'request': request, 'category': category},
        )
        serializer.is_valid(raise_exception=True)
        route, created = CategoryTechnician.objects.update_or_create(
            category=category,
            location=serializer.validated_data['location'],
            defaults={'technician': serializer.validated_data['technician']},
        )
        return Response(
            CategoryTechnicianSerializer(route).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def delete(self, request, category_id):
        category = self.get_category(request, category_id)
        location_id = request.query_params.get('location_id')
        if not location_id:
            raise ValidationError({'location_id': 'Indica la sede del enrutamiento que deseas quitar.'})
        deleted, _ = CategoryTechnician.objects.filter(
            category=category,
            location_id=location_id,
        ).delete()
        if not deleted:
            raise ValidationError({'location_id': 'No existe un enrutamiento para esa sede.'})
        return Response(status=status.HTTP_204_NO_CONTENT)


class IncidentViewSet(viewsets.ModelViewSet):
    http_method_names = ['get', 'post', 'patch', 'head', 'options']
    parser_classes = [JSONParser, FormParser, MultiPartParser]
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return incidents_visible_to(self.request.user)

    def get_serializer_class(self):
        if self.action == 'create':
            return IncidentCreateSerializer
        if self.action in {'update', 'partial_update'}:
            if self.request.user.effective_role == 'organization_admin':
                return IncidentAssignmentSerializer
            return IncidentStatusSerializer
        return IncidentReadSerializer

    def create(self, request, *args, **kwargs):
        if request.user.effective_role != 'user':
            raise PermissionDenied('Solo los usuarios pueden reportar incidencias.')
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        user = self.request.user
        if not has_active_location_membership(user, OrganizationMembership.Role.USER):
            raise PermissionDenied('Vincula tu cuenta a una sede activa antes de reportar.')
        category = serializer.validated_data['category']
        route = CategoryTechnician.objects.filter(
            category=category,
            location=user.location,
            technician__is_active=True,
            technician__organization_memberships__organization_id=user.location.organization_id,
            technician__organization_memberships__location=user.location,
            technician__organization_memberships__role=OrganizationMembership.Role.TECHNICIAN,
            technician__organization_memberships__is_active=True,
        ).select_related('technician').first()
        incident = serializer.save(
            reported_by=user,
            organization=user.location.organization,
            location=user.location,
            assigned_to=route.technician if route else None,
        )
        IncidentEvent.objects.create(
            incident=incident,
            actor=user,
            event_type=IncidentEvent.EventType.CREATED,
            new_value={'status': incident.status},
        )
        if incident.assigned_to_id:
            event = IncidentEvent.objects.create(
                incident=incident,
                actor=user,
                event_type=IncidentEvent.EventType.ASSIGNED,
                new_value={
                    'technician_id': incident.assigned_to_id,
                    'technician': incident.assigned_to.username,
                    'automatic': True,
                },
            )
            notify_incident_user(
                event,
                incident.assigned_to,
                f'Te asignaron la incidencia: {incident.title}.',
            )

    @transaction.atomic
    def perform_update(self, serializer):
        user = self.request.user
        incident = serializer.instance
        role = user.effective_role
        if role == 'technician':
            if 'assigned_to' in self.request.data:
                raise PermissionDenied('Solo el administrador puede asignar técnicos.')
            if incident.assigned_to_id != user.pk:
                raise PermissionDenied('Solo puedes actualizar incidencias asignadas a ti.')
        elif role == 'organization_admin':
            if 'status' in self.request.data:
                raise PermissionDenied('Solo el técnico asignado puede actualizar el estado.')
            if 'assigned_to' not in serializer.validated_data:
                raise ValidationError({'assigned_to': 'Selecciona el técnico de esta incidencia.'})
        else:
            raise PermissionDenied('No tienes permiso para actualizar esta incidencia.')

        old_status = incident.status
        old_assigned_to = incident.assigned_to
        updated_incident = serializer.save()
        if old_assigned_to != updated_incident.assigned_to:
            event = IncidentEvent.objects.create(
                incident=updated_incident,
                actor=user,
                event_type=IncidentEvent.EventType.ASSIGNED,
                old_value={
                    'technician_id': old_assigned_to.pk,
                    'technician': old_assigned_to.username,
                } if old_assigned_to else None,
                new_value={
                    'technician_id': updated_incident.assigned_to_id,
                    'technician': updated_incident.assigned_to.username,
                } if updated_incident.assigned_to else None,
            )
            if updated_incident.assigned_to:
                notify_incident_user(
                    event,
                    updated_incident.assigned_to,
                    f'Te asignaron la incidencia: {updated_incident.title}.',
                )
        if old_status != updated_incident.status:
            event = IncidentEvent.objects.create(
                incident=updated_incident,
                actor=user,
                event_type=IncidentEvent.EventType.STATUS_CHANGED,
                old_value={'status': old_status},
                new_value={
                    'status': updated_incident.status,
                    **(
                        {'resolution_note': updated_incident.resolution_note}
                        if updated_incident.status == Incident.Status.RESOLVED
                        else {}
                    ),
                },
            )
            notify_incident_user(
                event,
                updated_incident.reported_by,
                f'La incidencia {updated_incident.title} cambió a {updated_incident.get_status_display()}.',
            )


def notify_incident_user(event, recipient, message):
    IncidentNotification.objects.create(
        recipient=recipient,
        incident=event.incident,
        event=event,
        message=message,
    )


class IncidentNotificationListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        notifications = IncidentNotification.objects.filter(
            recipient=request.user,
            incident__in=incidents_visible_to(request.user),
        ).select_related('incident', 'event').order_by('-created_at')[:100]
        return Response(IncidentNotificationSerializer(notifications, many=True).data)


class IncidentNotificationReadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        notification = get_object_or_404(
            IncidentNotification.objects.filter(
                recipient=request.user,
                incident__in=incidents_visible_to(request.user),
            ).select_related('incident', 'event'),
            pk=pk,
        )
        if notification.read_at is None:
            notification.read_at = timezone.now()
            notification.save(update_fields=['read_at'])
        return Response(IncidentNotificationSerializer(notification).data)


class QueryParamJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        header = self.get_header(request)
        if header is None:
            raw_token = getattr(request, 'query_params', request.GET).get('token')
            if not raw_token:
                return None
            validated_token = self.get_validated_token(raw_token)
            return self.get_user(validated_token), validated_token
        return super().authenticate(request)


class IncidentEvidenceView(APIView):
    authentication_classes = [QueryParamJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        incident = get_object_or_404(incidents_visible_to(request.user), pk=pk)
        image_kind = request.query_params.get('kind', 'evidence')
        image = {
            'evidence': incident.evidence_image,
            'resolution': incident.resolution_image,
        }.get(image_kind)
        if not image or not image.storage.exists(image.name):
            raise Http404
        response = FileResponse(
            image.open('rb'),
            content_type=mimetypes.guess_type(image.name)[0] or 'application/octet-stream',
        )
        response['Cache-Control'] = 'private, no-store'
        response['X-Content-Type-Options'] = 'nosniff'
        return response
