from rest_framework import serializers
from rest_framework.reverse import reverse

from accounts.models import Location, Organization, OrganizationMembership, User
from accounts.tenancy import active_memberships, has_active_location_membership
from .models import Category, CategoryTechnician, Incident


class CategorySerializer(serializers.ModelSerializer):
    organization_id = serializers.PrimaryKeyRelatedField(
        source='organization',
        queryset=Organization.objects.filter(status=Organization.Status.ACTIVE),
        required=False,
    )

    class Meta:
        model = Category
        fields = ['id', 'name', 'description', 'organization_id', 'is_active']
        read_only_fields = ['id']

    def validate(self, attrs):
        user = self.context['request'].user
        organization = attrs.get(
            'organization',
            getattr(self.instance, 'organization', None),
        )
        if self.instance and organization != self.instance.organization:
            raise serializers.ValidationError({
                'organization_id': 'Una categoría no puede trasladarse a otra organización.',
            })
        if self.instance is None:
            if organization is None:
                raise serializers.ValidationError({'organization_id': 'Selecciona una organización.'})
            if (
                organization.status != Organization.Status.ACTIVE
                or not active_memberships(
                    user,
                    role=OrganizationMembership.Role.ORGANIZATION_ADMIN,
                ).filter(organization=organization).exists()
            ):
                raise serializers.ValidationError({
                    'organization_id': 'Solo puedes crear categorías en una organización que administras.',
                })
        return attrs


class CategoryTechnicianSerializer(serializers.ModelSerializer):
    location_id = serializers.PrimaryKeyRelatedField(
        source='location',
        queryset=Location.objects.filter(is_active=True),
    )
    technician_id = serializers.PrimaryKeyRelatedField(
        source='technician',
        queryset=User.objects.filter(is_active=True),
    )

    class Meta:
        model = CategoryTechnician
        fields = ['location_id', 'technician_id']

    def validate(self, attrs):
        category = self.context['category']
        location = attrs['location']
        technician = attrs['technician']
        user = self.context['request'].user
        if (
            location.organization_id != category.organization_id
            or not active_memberships(
                user,
                role=OrganizationMembership.Role.ORGANIZATION_ADMIN,
            ).filter(organization_id=category.organization_id).exists()
        ):
            raise serializers.ValidationError({
                'location_id': 'La sede debe pertenecer a una organización que administras.',
            })
        if (
            technician.effective_role != 'technician'
            or technician.location_id != location.pk
            or not active_memberships(
                technician,
                role=OrganizationMembership.Role.TECHNICIAN,
            ).filter(organization_id=category.organization_id, location=location).exists()
        ):
            raise serializers.ValidationError({
                'technician_id': 'El técnico debe tener membresía activa en la sede seleccionada.',
            })
        return attrs


class IncidentReadSerializer(serializers.ModelSerializer):
    category = serializers.CharField(source='category.name', read_only=True)
    reporter = serializers.CharField(source='reported_by.username', read_only=True)
    assigned_to = serializers.CharField(source='assigned_to.username', read_only=True)
    evidence_image = serializers.SerializerMethodField()

    class Meta:
        model = Incident
        fields = [
            'id',
            'title',
            'description',
            'category',
            'priority',
            'status',
            'reporter',
            'assigned_to',
            'evidence_image',
            'created_at',
            'updated_at',
        ]

    def get_evidence_image(self, obj):
        if not obj.evidence_image:
            return None
        request = self.context.get('request')
        if request:
            return reverse(
                'incident-evidence',
                kwargs={'pk': obj.pk},
                request=request,
            )
        return f'/api/v1/incidents/{obj.pk}/evidence/'


class IncidentCreateSerializer(serializers.ModelSerializer):
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.filter(is_active=True))

    class Meta:
        model = Incident
        fields = ['id', 'title', 'description', 'category', 'priority', 'evidence_image']
        read_only_fields = ['id']

    def validate_category(self, category):
        user = self.context['request'].user
        if (
            not has_active_location_membership(user, OrganizationMembership.Role.USER)
            or category.organization_id != user.location.organization_id
            or category.organization.status != Organization.Status.ACTIVE
        ):
            raise serializers.ValidationError('La categoría no pertenece a tu organización.')
        return category


class IncidentStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = Incident
        fields = ['status']

    def validate_status(self, status):
        current_status = self.instance.status
        if status == current_status:
            return status
        transitions = {
            Incident.Status.PENDING: {Incident.Status.IN_PROGRESS},
            Incident.Status.IN_PROGRESS: {Incident.Status.RESOLVED},
        }
        if status not in transitions.get(current_status, set()):
            raise serializers.ValidationError(
                'El flujo permitido es pendiente → en_proceso → resuelto.'
            )
        return status
