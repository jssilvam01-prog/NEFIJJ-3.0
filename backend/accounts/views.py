import hmac

from cryptography.fernet import InvalidToken
from django.db import transaction
from django.db.models import F, Q

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status, viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken

from .invitation_tokens import (
    add_business_days,
    create_invitation_code,
    decrypt_invitation_code,
    encrypt_invitation_code,
    hash_invitation_code,
)
from .models import (
    Location,
    Organization,
    OrganizationInvitation,
    OrganizationMembership,
    User,
)
from .serializers import (
    AdminPasswordResetSerializer,
    ChangePasswordSerializer,
    InvitationCreateSerializer,
    InvitationRegistrationSerializer,

    LoginSerializer,
    LocationSerializer,
    ManagedAccountSerializer,
    MembershipStatusSerializer,
    OrganizationAdminCreateSerializer,
    OrganizationInvitationSerializer,
    OrganizationSerializer,
    OrganizationUserSerializer,
    TechnicianCreateSerializer,
    UserProfileSerializer,
)
from .tenancy import active_organization_admin_ids


class LoginView(TokenObtainPairView):
    serializer_class = LoginSerializer


class ProfileView(generics.RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = UserProfileSerializer

    def get_object(self):
        return self.request.user


def technicians_managed_by(user):
    return User.objects.filter(
        role=User.Role.TECHNICIAN,
        location__organization_id__in=active_organization_admin_ids(user),
        organization_memberships__organization_id=F('location__organization_id'),
        organization_memberships__location_id=F('location_id'),
        organization_memberships__role=OrganizationMembership.Role.TECHNICIAN,
        organization_memberships__organization__status=Organization.Status.ACTIVE,
    ).distinct()


def organization_users_managed_by(user):
    return User.objects.filter(
        role=User.Role.STUDENT,
        location__organization_id__in=active_organization_admin_ids(user),
        location__is_active=True,
        organization_memberships__organization_id=F('location__organization_id'),
        organization_memberships__location_id=F('location_id'),
        organization_memberships__role=OrganizationMembership.Role.USER,
        organization_memberships__is_active=True,
        organization_memberships__organization__status=Organization.Status.ACTIVE,
    ).distinct()


def reset_managed_account_password(request, user):
    serializer = AdminPasswordResetSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user.set_password(serializer.validated_data['new_password'])
    user.save(update_fields=['password'])
    return Response({
        'message': 'Contraseña restablecida. Comunica la contraseña temporal de forma segura.',
    })


class ManagedOrganizationsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.effective_role != 'organization_admin':
            raise PermissionDenied('Solo un administrador puede consultar sus organizaciones.')
        organizations = Organization.objects.filter(
            pk__in=active_organization_admin_ids(request.user),
            status=Organization.Status.ACTIVE,
        )
        return Response([
            {'id': organization.pk, 'name': organization.name}
            for organization in organizations
        ])


class LocationViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = LocationSerializer
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        user = self.request.user
        if user.effective_role != 'organization_admin':
            return Location.objects.none()
        locations = Location.objects.filter(
            organization_id__in=active_organization_admin_ids(user),
            organization__status=Organization.Status.ACTIVE,
        ).select_related('organization')
        if self.action == 'list' and self.request.query_params.get('include_inactive') != 'true':
            locations = locations.filter(is_active=True)
        return locations

    def perform_create(self, serializer):
        if self.request.user.effective_role != 'organization_admin':
            raise PermissionDenied('Solo un administrador puede crear sedes.')
        serializer.save()

    def perform_update(self, serializer):
        if self.request.user.effective_role != 'organization_admin':
            raise PermissionDenied('Solo un administrador puede actualizar sedes.')
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        raise PermissionDenied('Las sedes se desactivan; no se eliminan.')


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class OrganizationViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = OrganizationSerializer
    queryset = Organization.objects.all()
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not request.user.is_superuser or request.user.role != User.Role.SUPERADMIN:
            raise PermissionDenied('Solo el superadministrador puede gestionar organizaciones.')


class OrganizationAdminListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_superuser or request.user.role != User.Role.SUPERADMIN:
            raise PermissionDenied('Solo el superadministrador puede gestionar administradores.')
        users = User.objects.filter(
            organization_memberships__role=OrganizationMembership.Role.ORGANIZATION_ADMIN,
        ).distinct().order_by('username')
        return Response(ManagedAccountSerializer(users, many=True).data)

    def post(self, request):
        if not request.user.is_superuser or request.user.role != User.Role.SUPERADMIN:
            raise PermissionDenied('Solo el superadministrador puede crear administradores.')
        serializer = OrganizationAdminCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(ManagedAccountSerializer(user).data, status=status.HTTP_201_CREATED)


class OrganizationAdminStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get_user(self, user_id):
        return get_object_or_404(
            User.objects.filter(
                Q(organization_memberships__role=OrganizationMembership.Role.ORGANIZATION_ADMIN)
                | Q(role=User.Role.ADMIN)
            ).distinct(),
            pk=user_id,
        )

    @transaction.atomic
    def patch(self, request, user_id):
        if not request.user.is_superuser or request.user.role != User.Role.SUPERADMIN:
            raise PermissionDenied('Solo el superadministrador puede gestionar administradores.')
        serializer = MembershipStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        organization_id = serializer.validated_data.get('organization_id')
        if organization_id is None:
            raise ValidationError({'organization_id': 'Indica la organización de esta membresía.'})
        membership = get_object_or_404(
            OrganizationMembership.objects.select_related('organization'),
            user_id=user_id,
            organization_id=organization_id,
            role=OrganizationMembership.Role.ORGANIZATION_ADMIN,
        )
        if serializer.validated_data['is_active'] and membership.organization.status != Organization.Status.ACTIVE:
            raise ValidationError({'is_active': 'No puedes activar una membresía en una organización suspendida.'})
        membership.is_active = serializer.validated_data['is_active']
        membership.save(update_fields=['is_active'])
        user = membership.user
        user.is_active = user.organization_memberships.filter(
            role=OrganizationMembership.Role.ORGANIZATION_ADMIN,
            is_active=True,
        ).exists()
        user.save(update_fields=['is_active'])
        return Response(ManagedAccountSerializer(user).data)

    def put(self, request, user_id):
        """Permite al superadmin cambiar la contraseña de un administrador."""
        if not request.user.is_superuser or request.user.role != User.Role.SUPERADMIN:
            raise PermissionDenied('Solo el superadministrador puede cambiar contraseñas de administradores.')

        user = self.get_user(user_id)
        serializer = AdminPasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user.set_password(serializer.validated_data['new_password'])
        user.save(update_fields=['password'])
        return Response({'message': 'Contraseña actualizada correctamente.'}, status=status.HTTP_200_OK)

    post = put

    @transaction.atomic
    def delete(self, request, user_id):
        """Permite al superadmin eliminar la cuenta de un administrador de organización."""
        if not request.user.is_superuser or request.user.role != User.Role.SUPERADMIN:
            raise PermissionDenied('Solo el superadministrador puede eliminar administradores.')

        user = self.get_user(user_id)
        if user.pk == request.user.pk:
            raise PermissionDenied('No puedes eliminar tu propia cuenta de superadministrador.')
        if user.is_superuser or user.role == User.Role.SUPERADMIN:
            raise PermissionDenied('No se puede eliminar una cuenta de superadministrador.')

        user.created_organization_invitations.all().delete()
        user.accepted_organization_invitations.update(used_by=None)
        user.incident_events.all().delete()
        user.reported_incidents.all().delete()
        user.organization_memberships.all().delete()
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)



class TechnicianListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.effective_role != 'organization_admin':
            raise PermissionDenied('Solo un administrador de organización puede gestionar técnicos.')
        users = technicians_managed_by(request.user).order_by('username')
        return Response(ManagedAccountSerializer(users, many=True).data)

    def post(self, request):
        if request.user.effective_role != 'organization_admin':
            raise PermissionDenied('Solo un administrador de organización puede crear técnicos.')
        serializer = TechnicianCreateSerializer(
            data=request.data,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(ManagedAccountSerializer(user).data, status=status.HTTP_201_CREATED)

    @transaction.atomic
    def patch(self, request, user_id):
        if request.user.effective_role != 'organization_admin':
            raise PermissionDenied('Solo un administrador puede gestionar técnicos.')
        serializer = MembershipStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if 'organization_id' in serializer.validated_data:
            raise ValidationError({'organization_id': 'La sede del técnico determina su organización.'})
        technician = get_object_or_404(
            User.objects.filter(
                role=User.Role.TECHNICIAN,
                location__organization_id__in=active_organization_admin_ids(request.user),
            ),
            pk=user_id,
        )
        membership = get_object_or_404(
            OrganizationMembership,
            user=technician,
            organization_id=technician.location.organization_id,
            location=technician.location,
            role=OrganizationMembership.Role.TECHNICIAN,
        )
        membership.is_active = serializer.validated_data['is_active']
        membership.save(update_fields=['is_active'])
        technician.is_active = technician.organization_memberships.filter(
            role=OrganizationMembership.Role.TECHNICIAN,
            is_active=True,
        ).exists()
        technician.save(update_fields=['is_active'])
        return Response(ManagedAccountSerializer(technician).data)


class TechnicianPasswordResetView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def put(self, request, user_id):
        if request.user.effective_role != 'organization_admin':
            raise PermissionDenied('Solo un administrador de organización puede cambiar contraseñas.')
        technician = get_object_or_404(
            technicians_managed_by(request.user).select_for_update(),
            pk=user_id,
        )
        return reset_managed_account_password(request, technician)


class OrganizationUserListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.effective_role != 'organization_admin':
            raise PermissionDenied('Solo un administrador de organización puede gestionar usuarios.')
        users = organization_users_managed_by(request.user).select_related('location').order_by('username')
        return Response(OrganizationUserSerializer(users, many=True).data)


class OrganizationUserPasswordResetView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def put(self, request, user_id):
        if request.user.effective_role != 'organization_admin':
            raise PermissionDenied('Solo un administrador de organización puede cambiar contraseñas.')
        user = get_object_or_404(
            organization_users_managed_by(request.user).select_for_update(),
            pk=user_id,
        )
        return reset_managed_account_password(request, user)


class OrganizationInvitationListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.effective_role != 'organization_admin':
            raise PermissionDenied('Solo un administrador de organización puede gestionar invitaciones.')
        organization_ids = active_organization_admin_ids(request.user)
        invitations = OrganizationInvitation.objects.filter(
            organization_id__in=organization_ids,
            organization__status=Organization.Status.ACTIVE,
        ).select_related('organization', 'location')
        return Response(OrganizationInvitationSerializer(invitations, many=True).data)

    def post(self, request):
        if request.user.effective_role != 'organization_admin':
            raise PermissionDenied('Solo un administrador de organización puede gestionar invitaciones.')
        serializer = InvitationCreateSerializer(
            data=request.data,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        location = serializer.validated_data['location']
        code = create_invitation_code()
        invitation = OrganizationInvitation.objects.create(
            organization=location.organization,
            location=location,
            created_by=request.user,
            token_hash=hash_invitation_code(code),
            code_ciphertext=encrypt_invitation_code(code),
            expires_at=add_business_days(timezone.now(), 7),
        )
        data = OrganizationInvitationSerializer(invitation).data
        data['code'] = code
        return Response(data, status=status.HTTP_201_CREATED)



class OrganizationLocationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.effective_role != 'organization_admin':
            raise PermissionDenied('Solo un administrador de organización puede consultar las sedes.')
        locations = Location.objects.filter(
            organization_id__in=active_organization_admin_ids(request.user),
            organization__status=Organization.Status.ACTIVE,
            is_active=True,
        ).select_related('organization').order_by('organization__name', 'name')
        return Response([
            {
                'id': location.pk,
                'name': location.name,
                'organization_id': location.organization_id,
                'organization': location.organization.name,
            }
            for location in locations
        ])


class OrganizationInvitationRevokeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if request.user.effective_role != 'organization_admin':
            raise PermissionDenied('Solo un administrador de organización puede revocar invitaciones.')
        invitation = get_object_or_404(
            OrganizationInvitation.objects.filter(
                organization_id__in=active_organization_admin_ids(request.user),
            ),
            pk=pk,
        )
        if invitation.used_at:
            raise ValidationError('Una invitación utilizada no puede revocarse.')
        if invitation.revoked_at is None:
            invitation.revoked_at = timezone.now()
            invitation.save(update_fields=['revoked_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class OrganizationInvitationRevealView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if request.user.effective_role != 'organization_admin':
            raise PermissionDenied('Solo un administrador de organización puede consultar invitaciones.')
        invitation = get_object_or_404(
            OrganizationInvitation.objects.select_related('organization', 'location').filter(
                organization_id__in=active_organization_admin_ids(request.user),
                organization__status=Organization.Status.ACTIVE,
            ),
            pk=pk,
        )
        if (
            invitation.revoked_at is not None
            or invitation.used_at is not None
            or invitation.expires_at <= timezone.now()
            or not invitation.location.is_active
        ):
            raise ValidationError({'code': 'La invitación ya no está activa y no se puede compartir.'})
        if not invitation.code_ciphertext:
            raise ValidationError({
                'code': 'Esta invitación no se puede recuperar. Genera una nueva invitación.',
            })

        try:
            code = decrypt_invitation_code(invitation.code_ciphertext)
        except (InvalidToken, UnicodeError) as exc:
            raise ValidationError({
                'code': 'No se pudo recuperar el código. Revoca esta invitación y genera otra.',
            }) from exc
        if not hmac.compare_digest(hash_invitation_code(code), invitation.token_hash):
            raise ValidationError({
                'code': 'El código no coincide con la invitación. Revócala y genera otra.',
            })

        response = Response({'code': code})
        response['Cache-Control'] = 'private, no-store'
        return response


class AcceptOrganizationInvitationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != User.Role.STUDENT or request.user.effective_role != 'user':
            raise PermissionDenied('Solo una cuenta de estudiante sin rol de soporte puede vincularse.')
        code = request.data.get('code')
        if not isinstance(code, str) or not code.strip():
            raise ValidationError({'code': 'Ingresa o escanea un código de invitación.'})

        with transaction.atomic():
            user = User.objects.select_for_update().get(pk=request.user.pk)
            if user.role != User.Role.STUDENT or user.effective_role != 'user':
                raise PermissionDenied('Solo una cuenta de estudiante sin rol de soporte puede vincularse.')
            invitation = OrganizationInvitation.objects.select_for_update().filter(
                token_hash=hash_invitation_code(code.strip()),
            ).first()
            if (
                invitation is None
                or invitation.revoked_at is not None
                or invitation.used_at is not None
                or invitation.expires_at <= timezone.now()
                or invitation.organization.status != Organization.Status.ACTIVE
                or not invitation.location.is_active
                or invitation.location.organization_id != invitation.organization_id
            ):
                raise ValidationError({'code': 'El código no es válido, venció o ya fue utilizado.'})

            membership = OrganizationMembership.objects.filter(
                organization=invitation.organization,
                user=user,
            ).first()
            if membership and membership.role != OrganizationMembership.Role.USER:
                raise PermissionDenied('La cuenta ya tiene un rol de soporte en esta organización.')
            if membership is None:
                membership = OrganizationMembership.objects.create(
                    organization=invitation.organization,
                    location=invitation.location,
                    user=user,
                    role=OrganizationMembership.Role.USER,
                )
            else:
                membership.location = invitation.location
                membership.is_active = True
                membership.save(update_fields=['location', 'is_active'])

            user.location = invitation.location
            user.save(update_fields=['location'])
            invitation.used_at = timezone.now()
            invitation.used_by = user
            invitation.save(update_fields=['used_at', 'used_by'])

        return Response({
            'organization': invitation.organization.name,
            'location': invitation.location.name,
        })


class RegisterWithInvitationView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request):
        serializer = InvitationRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        invitation = OrganizationInvitation.objects.select_for_update().select_related(
            'organization',
            'location',
        ).filter(
            token_hash=hash_invitation_code(data['code']),
        ).first()
        if (
            invitation is None
            or invitation.revoked_at is not None
            or invitation.used_at is not None
            or invitation.expires_at <= timezone.now()
            or invitation.organization.status != Organization.Status.ACTIVE
            or not invitation.location.is_active
            or invitation.location.organization_id != invitation.organization_id
        ):
            raise ValidationError({'code': 'El código no es válido, venció o ya fue utilizado.'})

        user = User.objects.create_user(
            username=data['username'],
            email=data['email'],
            first_name=data.get('first_name', ''),
            last_name=data.get('last_name', ''),
            password=data['password'],
            role=User.Role.STUDENT,
            location=invitation.location,
        )
        OrganizationMembership.objects.create(
            organization=invitation.organization,
            location=invitation.location,
            user=user,
            role=OrganizationMembership.Role.USER,
        )
        invitation.used_at = timezone.now()
        invitation.used_by = user
        invitation.save(update_fields=['used_at', 'used_by'])

        refresh = RefreshToken.for_user(user)
        return Response(
            {
                'refresh': str(refresh),
                'access': str(refresh.access_token),
                'user': UserProfileSerializer(user).data,
            },
            status=status.HTTP_201_CREATED,
        )
