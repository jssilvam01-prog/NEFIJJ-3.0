from django.contrib import admin

from .models import Category, Incident


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'organization', 'is_active']
    list_filter = ['organization', 'is_active']
    search_fields = ['name', 'organization__name']


@admin.register(Incident)
class IncidentAdmin(admin.ModelAdmin):
    list_display = ['title', 'organization', 'location', 'reported_by', 'status', 'priority', 'created_at']
    list_filter = ['organization', 'location', 'status', 'priority']
    search_fields = ['title', 'description', 'reported_by__username']
    readonly_fields = ['created_at', 'updated_at']
