import os
import secrets
import threading
import time
from flask import Flask
from flask_wtf.csrf import CSRFProtect
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_talisman import Talisman

from config import SECRET_KEY, DEBUG, HOST, PORT, TEMPLATES_DIR, STATIC_DIR

print(" DEBUG: Importando blueprint...")
from routes.main_routes import main_bp
print(" DEBUG: Blueprint importado com sucesso")

# Importar middleware
from middleware.session_middleware import setup_session_middleware

def create_secure_app():
    """Factory function para criar app Flask seguro"""
    
    # Criar app
    app = Flask(__name__, 
               template_folder=str(TEMPLATES_DIR),
               static_folder=str(STATIC_DIR))
    
    #  CONFIGURAÇÕES DE SEGURANÇA
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY') or SECRET_KEY or secrets.token_hex(32)
    app.config['WTF_CSRF_TIME_LIMIT'] = 7200  # 1 hora
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
    app.config['PERMANENT_SESSION_LIFETIME'] = 7200  # 30 min
    
    #  Configuração dinâmica baseada em ambiente
    if DEBUG:
        # Desenvolvimento - HTTP local permitido
        app.config['SESSION_COOKIE_SECURE'] = False
        app.config['WTF_CSRF_ENABLED'] = False  #  DESABILITAR CSRF EM DEBUG
        force_https = False
    else:
        # Produção - HTTPS obrigatório
        app.config['SESSION_COOKIE_SECURE'] = True
        app.config['WTF_CSRF_ENABLED'] = True
        force_https = True
    
    #  CSRF Protection APENAS EM PRODUÇÃO
    csrf = CSRFProtect(app)  #  SEMPRE criar o objeto
    if not DEBUG:
        print(" CSRF ativado para produção")
    else:
        print(" CSRF criado mas permissivo para debug")
    
    #  Rate Limiting
    limiter = Limiter(
        app=app,
        key_func=get_remote_address,
        default_limits=["200 per day", "50 per hour"]
    )
    
    #  Security Headers
    if not DEBUG:  # Só aplicar Talisman em produção
        Talisman(app, 
            force_https=force_https,
            strict_transport_security=True,
            content_security_policy={
                'default-src': "'self'",
                'script-src': "'self' 'unsafe-inline'",
                'style-src': "'self' 'unsafe-inline'",
                'img-src': "'self' data:",
                'font-src': "'self'"
            }
        )
    
    @app.after_request
    def security_headers(response):
        """ Headers de segurança obrigatórios"""
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        
        # Adicionar headers CORS seguros se necessário
        if DEBUG:
            response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5000'
            response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type, X-CSRFToken'
        
        return response
    
    #  Registrar blueprints ANTES do middleware
    app.register_blueprint(main_bp)
    print(" DEBUG: Blueprint main_bp registrado")
    
    #  DEBUG: Mostrar todas as rotas registradas
    print(" DEBUG: Rotas registradas:")
    for rule in app.url_map.iter_rules():
        print(f"   {rule.methods} {rule.rule} -> {rule.endpoint}")
    
    #  Configurar middleware DEPOIS de registrar blueprints
    # setup_session_middleware(app)  #  DESABILITADO TEMPORARIAMENTE
    print(" Session middleware DESABILITADO para debug")
    
    #  Cache configuration
    from models.cache_manager import cache
    app.config['CACHE_TYPE'] = 'simple'
    app.config['CACHE_DEFAULT_TIMEOUT'] = 300
    cache.init_app(app)
    
    #  Error handlers seguros
    @app.errorhandler(403)
    def forbidden(error):
        return {'erro': 'Acesso negado'}, 403
    
    @app.errorhandler(429)
    def ratelimit_handler(error):
        return {'erro': 'Muitas requisições - tente novamente em alguns minutos'}, 429
    
    @app.errorhandler(500)
    def internal_error(error):
        return {'erro': 'Erro interno do servidor'}, 500
    
    return app, csrf, limiter

def cache_cleanup_thread():
    """Thread para limpar cache antigo"""
    while True:
        time.sleep(1800)  # A cada 30 minutos
        try:
            from models.cache_manager import context_cache
            cleaned = context_cache.cleanup_old_cache()
            if cleaned > 0:
                print(f"Cache cleanup: {cleaned} sessões antigas removidas")
        except Exception as e:
            print(f"❌ Erro na limpeza de cache: {e}")

#  CRIAR APP SEGURO
app, csrf, limiter = create_secure_app()

#  Iniciar thread de limpeza
cleanup_thread = threading.Thread(target=cache_cleanup_thread, daemon=True)
cleanup_thread.start()
print("Thread de limpeza de cache iniciada")

if __name__ == '__main__':
    print(f"TITAN AI - SEGURO")
    print(f"CSRF Protection: {'DESABILITADO (DEBUG)' if DEBUG else 'ATIVO'}")
    print(f"Rate Limiting:  ATIVO") 
    print(f"Security Headers:  ATIVO")
    print(f"Acesse: http://{HOST}:{PORT}")
    
    #  Configuração de execução segura
    app.run(
        host=HOST, 
        port=PORT, 
        debug=DEBUG,
        threaded=True,
        use_reloader=False,
        ssl_context=('C:\\certs\\server.crt', 'C:\\certs\\server.key')
    )

AI_STREAM_CHUNK_SIZE = 4096
AI_STREAM_TIMEOUT = 200  
AI_THROTTLE_MS = 30
AI_BATCH_SIZE = 128
AI_NUM_THREADS = -1
AI_CONTEXT_SIZE = 8192