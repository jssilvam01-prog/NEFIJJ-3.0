"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/4.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin

from django.http import JsonResponse
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from accounts.views import LocationViewSet, OrganizationViewSet
from incidents.views import (
    CategoryTechnicianRoutesView,
    CategoryViewSet,
    IncidentEvidenceView,
    IncidentNotificationListView,
    IncidentNotificationReadView,
    IncidentViewSet,
)

router = DefaultRouter()
router.register('incidents', IncidentViewSet, basename='incident')
router.register('organizations', OrganizationViewSet, basename='organization')
router.register('categories', CategoryViewSet, basename='category')
router.register('locations', LocationViewSet, basename='location')


def health_check(request):
    return JsonResponse({'status': 'ok'})

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/health/', health_check, name='health'),
    path('api/v1/auth/', include('accounts.urls')),
    path(
        'api/v1/categories/<int:category_id>/routes/',
        CategoryTechnicianRoutesView.as_view(),
        name='category-technician-routes',
    ),
    path(
        'api/v1/incidents/<int:pk>/evidence/',
        IncidentEvidenceView.as_view(),
        name='incident-evidence',
    ),
    path(
        'api/v1/notifications/',
        IncidentNotificationListView.as_view(),
        name='incident-notifications',
    ),
    path(
        'api/v1/notifications/<int:pk>/read/',
        IncidentNotificationReadView.as_view(),
        name='incident-notification-read',
    ),
        path('api/v1/', include(router.urls)),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

