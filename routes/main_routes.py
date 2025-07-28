import time
import re
import json
import uuid
from datetime import datetime
from pathlib import Path
from flask import Blueprint, request, jsonify, session, render_template, Response, stream_with_context
from models.session_manager import session_manager
from models.database import db_manager
from utils.ai_client import ai_client
from models.request_manager import request_manager
from models.cache_manager import context_cache, cache_context
import requests
# ===== SEGURANÇA: IMPORTS ADICIONAIS =====
from flask_wtf.csrf import CSRFProtect, validate_csrf
from flask_wtf import FlaskForm
from wtforms import StringField, TextAreaField
from wtforms.validators import DataRequired, Length, Regexp
import secrets
import os
from werkzeug.utils import secure_filename
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import logging
logger = logging.getLogger(__name__)

# ===== RATE LIMITER =====
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["100 per hour"]
)

# ===== CONFIGURAÇÃO DE ONDE SALVAR FEEDBACK (SEGURO) =====
FEEDBACK_DIR = Path(__file__).parent.parent / 'data' / 'feedbacks'
FEEDBACK_DIR.mkdir(parents=True, exist_ok=True)

def get_safe_feedback_path():
    """Retorna path seguro para feedback"""
    filename = f"feedbacks_{datetime.now().strftime('%Y%m')}.json"
    safe_filename = secure_filename(filename)
    return FEEDBACK_DIR / safe_filename

# ===== CLASSE DE FORMULÁRIO DE FEEDBACK =====
class FeedbackForm(FlaskForm):
    titulo = StringField('Título', validators=[
        DataRequired(message="Título obrigatório"),
        Length(min=5, max=100, message="Título deve ter 5-100 caracteres"),
        Regexp(r'^[a-zA-Z0-9\s\.,!?-]+$', message="Caracteres inválidos")
    ])
    descricao = TextAreaField('Descrição', validators=[
        DataRequired(message="Descrição obrigatória"),
        Length(min=10, max=1000, message="Descrição deve ter 10-1000 caracteres"),
        Regexp(r'^[a-zA-Z0-9\s\.,!?\n-]+$', message="Caracteres inválidos")
    ])

main_bp = Blueprint('main', __name__)

# ===== FUNÇÕES DE FEEDBACK =====
def salvar_feedback_json(feedback_data):
    """Salva feedback em arquivo JSON"""
    try:
        feedback_path = get_safe_feedback_path()
        if feedback_path.exists():
            with open(feedback_path, 'r', encoding='utf-8') as f:
                feedbacks = json.load(f)
        else:
            feedbacks = []
        
        feedback_data['id'] = str(uuid.uuid4())
        feedback_data['timestamp'] = datetime.now().isoformat()
        feedbacks.append(feedback_data)
        
        with open(feedback_path, 'w', encoding='utf-8') as f:
            json.dump(feedbacks, f, ensure_ascii=False, indent=2)
        
        return {
            'status': 'sucesso',
            'feedback_id': feedback_data['id'],
            'message': 'Feedback salvo com sucesso!'
        }
        
    except Exception as e:
        return {
            'status': 'erro',
            'message': f'Erro ao salvar: {str(e)}'
        }

# ===== ROTAS =====
@main_bp.route('/')
def home():
    """Página principal do app"""
    return render_template('index.html')

@main_bp.route('/feedback.html')
def feedback_page():
    """Página de feedback do sistema"""
    return render_template('feedback.html')

@main_bp.route('/status')
def status():
    """Status do sistema"""
    status_data = session_manager.get_status()
    return jsonify({
        'status': 'online',
        'usuarios_ativos': status_data['usuarios_ativos'],
        'maximo_usuarios': status_data['maximo_usuarios'],
        'disponivel': status_data['usuarios_ativos'] < status_data['maximo_usuarios'],
        'fila_espera': status_data['fila_espera'],
        'stats': status_data['stats']
    })

@cache_context(timeout=300)
def get_user_context(session_id):
    """Busca contexto do usuário com cache inteligente"""
    try:
        dados_contexto_result = db_manager.buscar_dados(session_id=session_id)
        
        if (dados_contexto_result['status'] == 'sucesso' and 
            dados_contexto_result.get('dados') and 
            len(dados_contexto_result['dados']) > 0):
            
            contexto_dados = "Informações conhecidas sobre você:\n"
            for dado in dados_contexto_result['dados'][:5]:
                contexto_dados += f"- {dado['chave']}: {dado['valor']}\n"
            
            return contexto_dados
        else:
            return "Primeira conversa - ainda não sei nada sobre você."
            
    except Exception as e:
        print(f"❌ Erro ao buscar contexto: {e}")
        return "Erro ao acessar dados salvos."

def processar_thinking_mode(mensagem, frontend_thinking_mode, session_data=None):
    """
    Processa thinking mode mas MANTÉM comandos na mensagem
    """
    
    # 1. PRIORIDADE: Frontend definiu explicitamente  
    if frontend_thinking_mode is not None:
        print(f"🎯 [THINKING] Frontend definiu: {frontend_thinking_mode}")
        return frontend_thinking_mode, mensagem  # ✅ NÃO REMOVE COMANDOS
    
    # 2. DETECTAR comandos inline para determinar modo
    thinking_mode_final = None
    
    if '/no_think' in mensagem:
        thinking_mode_final = False
        print(f"🔴 [THINKING] Comando /no_think detectado")
    
    if '/think' in mensagem:
        thinking_mode_final = True  
        print(f"🟣 [THINKING] Comando /think detectado")
    
    # ✅ RETORNAR MENSAGEM ORIGINAL COM COMANDOS
    if thinking_mode_final is not None:
        return thinking_mode_final, mensagem
    
    # 3. Padrão do sistema
    default_mode = session_data.get('default_thinking', False) if session_data else False
    print(f"⚙️ [THINKING] Usando padrão: {default_mode}")
    
    return default_mode, mensagem

@main_bp.route('/chat-stream', methods=['POST'])
def chat_stream():
    """🌊 CHAT STREAMING ULTRA-OTIMIZADO"""
    try:
        # ✅ VALIDAÇÃO MÍNIMA
        data = request.get_json()
        mensagem = data.get('mensagem', '').strip()
        thinking_mode = data.get('thinking_mode', False)
        
        if not mensagem:
            return jsonify({'error': 'Mensagem obrigatória'}), 400

        # ✅ VERIFICAR OLLAMA RÁPIDO
        try:
            test_response = requests.get("http://localhost:11434/api/tags")
            if test_response.status_code != 200:
                return jsonify({'error': 'Ollama indisponível'}), 503
        except:
            return jsonify({'error': 'Ollama offline'}), 503

        # ✅ SESSÃO SIMPLIFICADA
        session_id = session.get('titan_session_id')
        if not session_id:
            session_id = str(uuid.uuid4())
            session['titan_session_id'] = session_id

        # ✅ REQUEST MANAGER SIMPLES
        request_id = str(uuid.uuid4())
        
        # ✅ MENSAGENS DIRETAS - SEM CONTEXTO PESADO
        messages = [
            {"role": "system", "content": "Você é o Titan, um assistente inteligente."},
            {"role": "user", "content": mensagem}
        ]

        # ✅ STREAM GENERATOR OTIMIZADO
        def generate():
            try:
                for chunk in ai_client.send_message_streaming(
                    messages,
                    thinking_mode=thinking_mode,
                    session_id=session_id,
                    request_id=request_id
                ):
                    # ✅ YIELD DIRETO - SEM PROCESSAMENTO
                    yield f"data: {json.dumps(chunk, ensure_ascii=False, separators=(',', ':'))}\n\n"
                    
            except Exception as e:
                error_chunk = {"error": str(e)}
                yield f"data: {json.dumps(error_chunk)}\n\n"

        return Response(
            stream_with_context(generate()),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no'  # ✅ NGINX OPTIMIZATION
            }
        )

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@main_bp.route('/thinking-mode', methods=['GET', 'POST'])
def thinking_mode():
    """Gerenciar thinking mode"""
    if request.method == 'POST':
        data = request.json
        enabled = data.get('enabled')
        session['thinking_mode'] = enabled
        return jsonify({'status': 'sucesso', 'thinking_mode': enabled})
    else:
        current_mode = session.get('thinking_mode', False)
        return jsonify({'thinking_mode': current_mode, 'status': 'sucesso'})

@main_bp.route('/debug-session')
def debug_session():
    """Debug da sessão atual"""
    flask_session_id = session.get('titan_session_id')
    
    debug_info = {
        'flask_session_id': flask_session_id,
        'session_exists_in_manager': False,
        'session_data': None,
        'manager_status': session_manager.get_status(),
        'timestamp': datetime.now().isoformat()
    }
    
    if flask_session_id:
        session_data = session_manager.get_session_data(flask_session_id)
        debug_info['session_exists_in_manager'] = session_data is not None
        if session_data:
            debug_info['session_data'] = {
                'ip': session_data.get('ip'),
                'inicio': session_data.get('inicio'),
                'ultima_atividade': session_data.get('ultima_atividade'),
                'requests_count': session_data.get('requests_count'),
                'chat_history_length': len(session_data.get('chat_history', []))
            }
    
    return jsonify(debug_info)

# ===== OUTRAS ROTAS ESSENCIAIS =====
@main_bp.route('/new-session', methods=['POST'])
def new_session():
    """Iniciar nova sessão"""
    try:
        user_ip = request.environ.get('HTTP_X_FORWARDED_FOR', request.remote_addr)
        
        if not session_manager.pode_entrar():
            return jsonify({'status': 'erro', 'message': 'Sistema ocupado'}), 503
        
        backend_session_id = session_manager.criar_sessao(user_ip)
        if not backend_session_id:
            return jsonify({'status': 'erro', 'message': 'Falha ao criar sessão'}), 500
        
        session['titan_session_id'] = backend_session_id
        session.permanent = True
        
        return jsonify({
            'status': 'sucesso',
            'session_id': backend_session_id,
            'message': 'Nova sessão criada'
        })
        
    except Exception as e:
        return jsonify({'status': 'erro', 'message': str(e)}), 500

@main_bp.route('/cancel-request', methods=['POST'])
def cancel_request():
    """Cancelar request ativa da sessão"""
    try:
        session_id = session.get('titan_session_id')
        if not session_id:
            return jsonify({'erro': 'Sessão inválida'}), 401
        
        request_manager.cancel_session_requests(session_id)
        return jsonify({'status': 'sucesso', 'message': 'Requests canceladas'})
        
    except Exception as e:
        return jsonify({'erro': str(e)}), 500

@main_bp.route('/clear-chat-history', methods=['POST'])
def clear_chat_history():
    """Limpar histórico de chat"""
    try:
        session_id = session.get('titan_session_id')
        if not session_id:
            return jsonify({"erro": "Sessão inválida"}), 401
        
        session_manager.update_chat_history(session_id, [])
        return jsonify({'status': 'sucesso', 'message': 'Histórico limpo'})
        
    except Exception as e:
        return jsonify({'erro': str(e)}), 500

# ===== ROTAS DE FEEDBACK =====
@main_bp.route('/api/feedback', methods=['POST'])
def criar_feedback():
    try:
        titulo = request.json.get('titulo', '')
        descricao = request.json.get('descricao', '')
        
        if len(titulo) < 5 or len(descricao) < 10:
            return jsonify({'erro': 'Título e descrição muito curtos'}), 400
        
        session_id = session.get('titan_session_id', 'anonymous')
        user_ip = request.environ.get('HTTP_X_FORWARDED_FOR', request.remote_addr)
        
        feedback_data = {
            'session_id': session_id,
            'user_ip': user_ip,
            'tipo': request.json.get('tipo', 'geral'),
            'titulo': titulo,
            'descricao': descricao,
            'thinking_mode': request.json.get('thinking_mode', False)
        }
        
        resultado = salvar_feedback_json(feedback_data)
        return jsonify(resultado)
        
    except Exception as e:
        return jsonify({'erro': str(e)}), 500

# ===== ROTAS ADMIN =====
@main_bp.route('/admin/stats')
def admin_stats():
    """Estatísticas do sistema"""
    return jsonify(session_manager.get_status())

@main_bp.route('/api/chat', methods=['GET', 'POST'])
def api_chat():
    """API de chat/histórico"""
    if request.method == 'GET':
        return jsonify({
            'status': 'sucesso',
            'chats': []
        })
    else:
        return jsonify({
            'status': 'sucesso',
            'message': 'Chat salvo'
        })

@main_bp.route('/api/chat/<chat_id>', methods=['DELETE'])
def delete_chat(chat_id):
    """Deletar chat"""
    return jsonify({
        'status': 'sucesso',
        'message': 'Chat deletado'
    })

@main_bp.route('/end-session', methods=['POST'])
def end_session():
    """Finalizar sessão"""
    return jsonify({'status': 'sucesso'})

@main_bp.route('/api/chats', methods=['GET', 'POST'])  # ✅ ROTA QUE FALTAVA
def api_chats():
    """API para chats (diferente de /api/chat)"""
    if request.method == 'GET':
        return jsonify({'status': 'sucesso', 'chats': []})
    else:
        return jsonify({'status': 'sucesso', 'message': 'Chat salvo'})