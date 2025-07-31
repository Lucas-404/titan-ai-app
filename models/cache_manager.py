from flask_caching import Cache
from functools import wraps
import time

# Cache global do Flask
cache = Cache()

class ContextCache:
    """Cache inteligente para contexto de sessões"""
    
    def __init__(self):
        self._context_cache = {}        # Cache dos contextos
        self._context_dirty = set()     # Sessões que precisam recarregar
        self._last_access = {}          # Último acesso para limpeza
        
        print("ContextCache inicializado")
    
    def get_context(self, session_id):
        """Busca contexto do cache (retorna None se precisa recarregar)"""
        if not session_id:
            return None
            
        # Se está marcado como sujo, precisa recarregar
        if session_id in self._context_dirty:
            print(f"🔄 Cache MISS - Session {session_id[:8]}... marcada como suja")
            return None
        
        # Se existe no cache, usar
        if session_id in self._context_cache:
            self._last_access[session_id] = time.time()
            print(f"⚡ Cache HIT - Session {session_id[:8]}...")
            return self._context_cache[session_id]
        
        # Cache vazio para esta sessão
        print(f"📭 Cache EMPTY - Session {session_id[:8]}...")
        return None
    
    def set_context(self, session_id, context_data):
        """Salva contexto no cache e marca como limpo"""
        if not session_id:
            return
            
        self._context_cache[session_id] = context_data
        self._context_dirty.discard(session_id)
        self._last_access[session_id] = time.time()
        
        print(f"💾 Context cached - Session {session_id[:8]}... ({len(context_data)} chars)")
    
    def invalidate_context(self, session_id):
        """Marca contexto como sujo (vai recarregar na próxima)"""
        if not session_id:
            return
            
        self._context_dirty.add(session_id)
        print(f"🗑️ Context invalidated - Session {session_id[:8]}...")
    
    def cleanup_old_cache(self):
        """Remove cache antigo (sessões não acessadas há mais de 1 hora)"""
        now = time.time()
        old_sessions = []
        
        for session_id, last_access in self._last_access.items():
            if now - last_access > 3600:  # 1 hora
                old_sessions.append(session_id)
        
        for session_id in old_sessions:
            self._context_cache.pop(session_id, None)
            self._context_dirty.discard(session_id)
            self._last_access.pop(session_id, None)
            print(f"🧹 Cache expired - Session {session_id[:8]}...")
        
        return len(old_sessions)
    
    def get_stats(self):
        """Estatísticas do cache"""
        return {
            'cached_sessions': len(self._context_cache),
            'dirty_sessions': len(self._context_dirty),
            'total_tracked': len(self._last_access)
        }

# Instância global
context_cache = ContextCache()

def cache_context(timeout=300):
    """Decorator para cachear funções que retornam contexto"""
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            # Tentar usar cache primeiro
            session_id = kwargs.get('session_id')
            cached = context_cache.get_context(session_id)
            
            if cached is not None:
                return cached
            
            # Cache miss - executar função
            result = f(*args, **kwargs)
            
            # Salvar no cache
            if result and session_id:
                context_cache.set_context(session_id, result)
            
            return result
        return wrapper
    return decorator