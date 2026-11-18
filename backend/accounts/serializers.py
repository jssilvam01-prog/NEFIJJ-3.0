from django.conf import settings
from django.contrib.auth.password_validation import validate_password

from django.db import transaction
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import (
    Location,
    Organization,
    OrganizationInvitation,
    OrganizationMembership,
    User,
)
from .tenancy import active_memberships, has_active_location_membership


class ManagedAccountSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    location_id = serializers.PrimaryKeyRelatedField(
        source='location',
        queryset=Location.objects.filter(is_active=True),
        required=False,
    )
    location = serializers.CharField(source='location.name', read_only=True, allow_null=True)
    is_active = serializers.BooleanField(read_only=True)
    organization_ids = serializers.SerializerMethodField()
    organization_memberships = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'password',
            'location_id',
            'location',
            'is_active',
            'organization_ids',
            'organization_memberships',
        ]
        read_only_fields = ['id']

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError('Este nombre de usuario ya está registrado.')
        return value

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('Este correo ya está registrado.')
        return value

    def get_organization_ids(self, user):
        return list(
            user.organization_memberships.filter(is_active=True).values_list(
                'organization_id',
                flat=True,
            )
        )

    def get_organization_memberships(self, user):
        return [
            {
                'organization_id': membership.organization_id,
                'organization_name': membership.organization.name,
                'location_id': membership.location_id,
                'location_name': membership.location.name if membership.location else None,
                'role': membership.role,
                'is_active': membership.is_active,
            }
            for membership in user.organization_memberships.select_related(
                'organization',
                'location',
            ).all()
        ]


class OrganizationAdminCreateSerializer(ManagedAccountSerializer):
    organization_id = serializers.IntegerField(write_only=True)

    class Meta(ManagedAccountSerializer.Meta):
        fields = ManagedAccountSerializer.Meta.fields + ['organization_id']

    def validate_organization_id(self, organization_id):
        try:
            organization = Organization.objects.get(
                pk=organization_id,
                status=Organization.Status.ACTIVE,
            )
        except Organization.DoesNotExist as exc:
            raise serializers.ValidationError('La organización no existe o está inactiva.') from exc
        return organization

    def validate(self, attrs):
        if 'organization_id' not in attrs:
            raise serializers.ValidationError({
                'organization_id': 'Selecciona la organización que administrará esta cuenta.',
            })
        if attrs.get('location'):
            raise serializers.ValidationError({
                'location_id': 'Un administrador de organización no se asigna a una sede.',
            })
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        organization = validated_data.pop('organization_id')
        password = validated_data.pop('password')
        user = User.objects.create_user(
            **validated_data,
            password=password,
            role=User.Role.ADMIN,
        )
        OrganizationMembership.objects.create(
            organization=organization,
            user=user,
            role=OrganizationMembership.Role.ORGANIZATION_ADMIN,
        )
        return user


class TechnicianCreateSerializer(ManagedAccountSerializer):
    def validate(self, attrs):
        location = attrs.get('location')
        user = self.context['request'].user
        if (
            location is None
            or location.organization.status != Organization.Status.ACTIVE
            or not active_memberships(
                user,
                role=OrganizationMembership.Role.ORGANIZATION_ADMIN,
            ).filter(organization_id=location.organization_id).exists()
        ):
            raise serializers.ValidationError({
                'location_id': 'Selecciona una sede activa de una organización que administras.',
            })
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        location = validated_data['location']
        password = validated_data.pop('password')
        user = User.objects.create_user(
            **validated_data,
            password=password,
            role=User.Role.TECHNICIAN,
        )
        OrganizationMembership.objects.create(
            organization=location.organization,
            location=location,
            user=user,
            role=OrganizationMembership.Role.TECHNICIAN,
        )
        return user


class UserProfileSerializer(serializers.ModelSerializer):
    role = serializers.CharField(source='effective_role', read_only=True)
    organization = serializers.SerializerMethodField()
    location = serializers.CharField(source='location.name', read_only=True, allow_null=True)
    location_id = serializers.IntegerField(
        source='location.pk',
        read_only=True,
        allow_null=True,
    )
    tenant_active = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'role',
            'organization',
            'location',
            'location_id',
            'tenant_active',
        ]
        read_only_fields = fields

    def get_organization(self, user):
        if user.location_id:
            return user.location.organization.name
        membership = user.organization_memberships.filter(is_active=True).select_related(
            'organization'
        ).first()
        return membership.organization.name if membership else None

    def get_tenant_active(self, user):
        if user.effective_role == 'superadmin':
            return True
        if user.effective_role == 'organization_admin':
            return active_memberships(user, OrganizationMembership.Role.ORGANIZATION_ADMIN).exists()
        if user.effective_role == 'technician':
            return has_active_location_membership(
                user,
                OrganizationMembership.Role.TECHNICIAN,
            )
        return has_active_location_membership(user, OrganizationMembership.Role.USER)


class LoginSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        data['user'] = UserProfileSerializer(self.user).data
        return data


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password_confirm = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_current_password(self, value):
        if not self.context['request'].user.check_password(value):
            raise serializers.ValidationError('La contraseña actual no es correcta.')
        return value

    def validate_new_password(self, value):
        validate_password(value, user=self.context['request'].user)
        return value

    def validate(self, attrs):
        if attrs['new_password'] != attrs['new_password_confirm']:
            raise serializers.ValidationError({'new_password_confirm': 'Las contraseñas nuevas no coinciden.'})
        if attrs['current_password'] == attrs['new_password']:
            raise serializers.ValidationError({'new_password': 'La nueva contraseña debe ser diferente.'})
        return attrs

    def save(self, **kwargs):
        user = self.context['request'].user
        user.set_password(self.validated_data['new_password'])
        user.save(update_fields=['password'])
        return user


class MembershipStatusSerializer(serializers.Serializer):
    is_active = serializers.BooleanField()
    organization_id = serializers.IntegerField(required=False)


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ['id', 'name', 'slug', 'status', 'created_at', 'updated_at']
        read_only_fields = ['id', 'slug', 'created_at', 'updated_at']


class LocationSerializer(serializers.ModelSerializer):
    organization = serializers.CharField(source='organization.name', read_only=True)
    organization_id = serializers.PrimaryKeyRelatedField(
        source='organization',
        queryset=Organization.objects.filter(status=Organization.Status.ACTIVE),
        required=False,
    )

    class Meta:
        model = Location
        fields = [
            'id',
            'name',
            'code',
            'organization_id',
            'organization',
            'is_active',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def validate(self, attrs):
        user = self.context['request'].user
        organization = attrs.get(
            'organization',
            getattr(self.instance, 'organization', None),
        )
        if self.instance and organization != self.instance.organization:
            raise serializers.ValidationError({
                'organization_id': 'Una sede no puede trasladarse a otra organización.',
            })
        if self.instance is None:
            if organization is None or not active_memberships(
                user,
                role=OrganizationMembership.Role.ORGANIZATION_ADMIN,
            ).filter(organization=organization).exists():
                raise serializers.ValidationError({
                    'organization_id': 'Solo puedes crear sedes en una organización que administras.',
                })
        return attrs


class InvitationCreateSerializer(serializers.Serializer):
    location_id = serializers.PrimaryKeyRelatedField(
        source='location',
        queryset=Location.objects.filter(is_active=True),
    )

    def validate_location_id(self, location):
        user = self.context['request'].user
        if (
            location.organization.status != Organization.Status.ACTIVE
            or not active_memberships(
                user,
                role=OrganizationMembership.Role.ORGANIZATION_ADMIN,
            ).filter(organization_id=location.organization_id).exists()
        ):
            raise serializers.ValidationError(
                'Solo puedes crear invitaciones para sedes activas de tu organización.'
            )
        return location


class AdminPasswordResetSerializer(serializers.Serializer):
    new_password = serializers.CharField(write_only=True, validators=[validate_password])
    new_password_confirm = serializers.CharField(write_only=True, required=False)

    def validate(self, attrs):
        confirm = attrs.get('new_password_confirm')
        if confirm and attrs['new_password'] != confirm:
            raise serializers.ValidationError({'new_password_confirm': 'Las contraseñas no coinciden.'})
        return attrs


class OrganizationInvitationSerializer(serializers.ModelSerializer):
    organization_id = serializers.IntegerField(read_only=True)
    location_id = serializers.IntegerField(read_only=True)
    location_name = serializers.CharField(source='location.name', read_only=True)

    class Meta:
        model = OrganizationInvitation
        fields = [
            'id',
            'organization_id',
            'location_id',
            'location_name',
            'created_at',
            'expires_at',
            'revoked_at',
            'used_at',
        ]
        read_only_fields = fields

