from rest_framework.pagination import PageNumberPagination

class StandardPagination(PageNumberPagination):
    """Enforces strict pagination with a maximum limit to prevent unbounded memory spikes."""
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100
