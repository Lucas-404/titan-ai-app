import time
import re
import json
import uuid
from datetime import datetime
from pathlib import Path
from flask import Blueprint, request, jsonify, session, render_template, Response, stream_with_context
from models.session_manager import session_manager
from models.database import db_manager
from models.chat_manager import chat_manager
from utils.ai_client import ai_client
from models.request_manager import request_manager
from models.cache_manager import context_cache, cache_context
import requests
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

# ===== GERAÇÃO INTELIGENTE DE TÍTULOS =====
def generate_smart_title(messages):
    """Gera título inteligente baseado na conversa usando IA"""
    try:
        if not messages or len(messages) == 0:
            return "Nova Conversa"
        
        # Pegar as primeiras mensagens para gerar título
        conversation_sample = []
        for msg in messages[:4]:  # Primeiras 4 mensagens
            if msg.get('role') in ['user', 'assistant']:
                content = msg.get('content', '')[:200]  # Limitar tamanho
                conversation_sample.append(f"{msg['role']}: {content}")
        
        if not conversation_sample:
            return "Nova Conversa"
        
        # Prompt para gerar título
        title_prompt = f"""Baseado na conversa abaixo, gere um título conciso e descritivo em português (máximo 6 palavras):

{chr(10).join(conversation_sample)}

Responda APENAS com o título, sem explicações."""

        # Fazer chamada para IA (sincrona)
        try:
            response = ai_client.generate_simple_response(title_prompt)
            
            if response and len(response.strip()) > 5:
                title = response.strip()
                # Limpar e validar título
                title = re.sub(r'[^\w\s\-\.\,\!\?]', '', title)
                title = title[:50]  # Limitar tamanho
                
                if len(title) > 5:  # Título válido
                    return title
        except:
            pass
        
        # Fallback: usar primeira mensagem do usuário
        for msg in messages:
            if msg.get('role') == 'user' and msg.get('content'):
                title = msg['content'][:30]
                if len(title) > 5:
                    return title + "..."
        
        return "Nova Conversa"
        
    except Exception as e:
        logger.error(f"Erro ao gerar título inteligente: {str(e)}")
        # Fallback para primeira mensagem
        for msg in messages:
            if msg.get('role') == 'user' and msg.get('content'):
                return msg['content'][:30] + "..."
        return "Nova Conversa"

# ===== RATE LIMITER =====
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["100 per hour"]
)

# ===== CONFIGURAÇÃO DE ONDE SALVAR FEEDBACK (SEGURO) =====
FEEDBACK_DIR = Path(__file__).parent.parent / 'data' / 'feedbacks'
# FEEDBACK_DIR.mkdir(parents=True, exist_ok=True) # Desabilitado para evitar criação automática

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
        print(f" Erro ao buscar contexto: {e}")
        return "Erro ao acessar dados salvos."

def processar_thinking_mode(mensagem, frontend_thinking_mode, session_data=None):
    """
    Processa thinking mode mas MANTÉM comandos na mensagem
    """
    
    # 1. PRIORIDADE: Frontend definiu explicitamente  
    if frontend_thinking_mode is not None:
        print(f"[THINKING] Frontend definiu: {frontend_thinking_mode}")
        return frontend_thinking_mode, mensagem  #  NÃO REMOVE COMANDOS
    
    # 2. DETECTAR comandos inline para determinar modo
    thinking_mode_final = None
    
    if '/no_think' in mensagem:
        thinking_mode_final = False
        print(f"[THINKING] Comando /no_think detectado")
    
    if '/think' in mensagem:
        thinking_mode_final = True  
        print(f"🟣 [THINKING] Comando /think detectado")
    
    #  RETORNAR MENSAGEM ORIGINAL COM COMANDOS
    if thinking_mode_final is not None:
        return thinking_mode_final, mensagem
    
    # 3. Padrão do sistema
    default_mode = session_data.get('default_thinking', False) if session_data else False
    print(f"[THINKING] Usando padrão: {default_mode}")
    
    return default_mode, mensagem

@main_bp.route('/chat-stream', methods=['POST'])
def chat_stream():
    """ CHAT STREAMING COM AUTO-SAVE INTEGRADO"""
    try:
        #  VALIDAÇÃO MÍNIMA
        data = request.get_json()
        mensagem = data.get('mensagem', '').strip()
        thinking_mode = data.get('thinking_mode', False)
        
        if not mensagem:
            return jsonify({'error': 'Mensagem obrigatória'}), 400

        #  VERIFICAR OLLAMA RÁPIDO
        try:
            test_response = requests.get("http://localhost:11434/api/tags")
            if test_response.status_code != 200:
                return jsonify({'error': 'Ollama indisponível'}), 503
        except:
            return jsonify({'error': 'Ollama offline'}), 503

        #  SESSÃO OBRIGATÓRIA
        session_id = session.get('titan_session_id')
        if not session_id:
            return jsonify({'error': 'Sessão não encontrada'}), 401

        print(f"💬 [CHAT-STREAM] Sessão: {session_id[:8]}... | Mensagem: {mensagem[:50]}...")

        #  REQUEST MANAGER SIMPLES
        request_id = str(uuid.uuid4())
        
        # 🆕 VERIFICAR SE DEVE REUTILIZAR CHAT EXISTENTE OU CRIAR NOVO
        existing_chats = chat_manager.load_history(session_id=session_id)
        
        if len(existing_chats) == 0:
            # PRIMEIRA INTERAÇÃO - Criar novo chat
            print(f"🆕 [CHAT-STREAM] Primeira interação - criando novo chat para sessão {session_id[:8]}...")
            current_chat_id = str(uuid.uuid4())
            chat_messages = [
                {"role": "user", "content": mensagem, "timestamp": datetime.now().isoformat()}
            ]
            is_new_chat = True
        else:
            # CONVERSA EXISTENTE - Reutilizar último chat
            latest_chat = existing_chats[0]  # Chats são ordenados por data (mais recente primeiro)
            current_chat_id = latest_chat['id']
            print(f"💬 [CHAT-STREAM] Continuando conversa existente {current_chat_id[:8]}... para sessão {session_id[:8]}...")
            
            # Carregar mensagens existentes do chat
            existing_chat_data = chat_manager.get_chat_by_id(current_chat_id, session_id=session_id)
            if existing_chat_data and existing_chat_data.get('messages'):
                chat_messages = existing_chat_data['messages'].copy()
            else:
                chat_messages = []
            
            # Adicionar nova mensagem do usuário
            chat_messages.append({
                "role": "user", 
                "content": mensagem, 
                "timestamp": datetime.now().isoformat()
            })
            is_new_chat = False
        
        #  MENSAGENS PARA IA - SEM CONTEXTO PESADO  
        messages = [
            {"role": "system", "content": "Você é o Titan, um assistente inteligente."},
            {"role": "user", "content": mensagem}
        ]

        #  STREAM GENERATOR COM AUTO-SAVE INTEGRADO
        def generate():
            assistant_response = ""
            assistant_thinking = ""
            
            try:
                for chunk in ai_client.send_message_streaming(
                    messages,
                    thinking_mode=thinking_mode,
                    session_id=session_id,
                    request_id=request_id
                ):
                    # 📝 COLETAR CONTEÚDO PARA SALVAR
                    if chunk.get('type') == 'content' and chunk.get('content'):
                        assistant_response += chunk.get('content', '')
                    elif chunk.get('type') == 'thinking_done' and chunk.get('thinking'):
                        assistant_thinking = chunk.get('thinking', '')
                    
                    #  YIELD PARA O FRONTEND
                    yield f"data: {json.dumps(chunk, ensure_ascii=False, separators=(',', ':'))}\n\n"
                    
                    # 🆕 AUTO-SAVE QUANDO STREAMING TERMINA
                    if chunk.get('type') == 'done':
                        print(f"💾 [CHAT-STREAM] Salvando chat automaticamente...")
                        
                        # Adicionar resposta da IA às mensagens
                        assistant_message = {
                            "role": "assistant", 
                            "content": assistant_response,
                            "timestamp": datetime.now().isoformat()
                        }
                        
                        if assistant_thinking:
                            assistant_message["thinking"] = assistant_thinking
                        
                        chat_messages.append(assistant_message)
                        
                        # 🆕 SALVAR/ATUALIZAR CHAT AUTOMATICAMENTE
                        if is_new_chat:
                            # Novo chat - usar data atual para criação
                            created_at = datetime.now().isoformat()
                            title = generate_smart_title(chat_messages)
                            print(f"💾 [CHAT-STREAM] Salvando NOVO chat: {title[:30]}...")
                        else:
                            # Chat existente - manter data de criação original
                            existing_chat_data = chat_manager.get_chat_by_id(current_chat_id, session_id=session_id)
                            created_at = existing_chat_data.get('created_at') if existing_chat_data else datetime.now().isoformat()
                            # Manter título original ou gerar novo se não existir
                            title = existing_chat_data.get('title') if existing_chat_data else generate_smart_title(chat_messages)
                            print(f"💾 [CHAT-STREAM] Atualizando chat existente: {title[:30]}...")
                        
                        chat_data = {
                            'id': current_chat_id,
                            'session_id': session_id,
                            'title': title,
                            'messages': chat_messages,
                            'created_at': created_at,
                            'updated_at': datetime.now().isoformat(),
                            'thinking': thinking_mode
                        }
                        
                        save_result = chat_manager.save_chat(chat_data)
                        if save_result['status'] == 'sucesso':
                            print(f"✅ [CHAT-STREAM] Chat salvo automaticamente: {current_chat_id[:8]}...")
                        else:
                            print(f"❌ [CHAT-STREAM] Erro ao salvar chat: {save_result.get('message')}")
                    
            except Exception as e:
                print(f"❌ [CHAT-STREAM] Erro no streaming: {str(e)}")
                error_chunk = {"error": str(e)}
                yield f"data: {json.dumps(error_chunk)}\n\n"

        return Response(
            stream_with_context(generate()),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no'  #  NGINX OPTIMIZATION
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

@main_bp.route('/api/chats/<chat_id>', methods=['DELETE'])
def delete_chat(chat_id):
    """Deletar chat específico"""
    try:
        # Obter session_id
        session_id = session.get('titan_session_id')
        if not session_id:
            return jsonify({'status': 'erro', 'message': 'Sessão não encontrada'}), 400
        
        # Deletar usando chat_manager
        result = chat_manager.delete_chat(chat_id, session_id=session_id)
        
        if result['status'] == 'sucesso':
            return jsonify({
                'status': 'sucesso',
                'message': 'Chat deletado com sucesso'
            })
        else:
            return jsonify(result), 404
            
    except Exception as e:
        logger.error(f"Erro ao deletar chat {chat_id}: {str(e)}")
        return jsonify({'status': 'erro', 'message': 'Erro interno do servidor'}), 500

@main_bp.route('/end-session', methods=['POST'])
def end_session():
    """Finalizar sessão"""
    return jsonify({'status': 'sucesso'})

@main_bp.route('/api/chats', methods=['GET', 'POST'])
def api_chats():
    """API completa para gerenciamento de chats"""
    try:
        # Obter session_id
        session_id = session.get('titan_session_id')
        if not session_id:
            return jsonify({'status': 'erro', 'message': 'Sessão não encontrada'}), 400
        
        if request.method == 'GET':
            # Carregar histórico de chats da sessão (apenas metadados)
            history = chat_manager.load_history(session_id=session_id)
            
            # Enriquecer cada chat com preview otimizado
            enhanced_chats = []
            for chat in history:
                if isinstance(chat, dict):
                    enhanced_chat = chat.copy()
                    
                    # Na nova estrutura, já temos metadados pré-processados
                    message_count = chat.get('message_count', 0)
                    
                    # Para preview completo, carregar apenas primeiras/últimas mensagens se necessário
                    if message_count > 0:
                        # Tentar carregar chat completo apenas se necessário para preview detalhado
                        try:
                            full_chat = chat_manager.get_chat_by_id(chat.get('id'), session_id)
                            if full_chat and full_chat.get('messages'):
                                messages = full_chat['messages']
                                
                                # Primeira mensagem do usuário
                                first_user_msg = next((msg for msg in messages if msg.get('role') == 'user'), None)
                                # Última mensagem da IA
                                last_assistant_msg = next((msg for msg in reversed(messages) if msg.get('role') == 'assistant'), None)
                                
                                enhanced_chat['preview'] = {
                                    'first_user_message': first_user_msg.get('content', '')[:100] if first_user_msg else '',
                                    'last_assistant_message': last_assistant_msg.get('content', '')[:100] if last_assistant_msg else '',
                                    'message_count': len(messages),
                                    'has_thinking': chat.get('thinking', False) or any(msg.get('thinking') for msg in messages if msg.get('role') == 'assistant')
                                }
                            else:
                                # Fallback usando metadados
                                enhanced_chat['preview'] = {
                                    'first_user_message': 'Conversa disponível',
                                    'last_assistant_message': 'Clique para carregar',
                                    'message_count': message_count,
                                    'has_thinking': chat.get('thinking', False)
                                }
                        except Exception as e:
                            # Fallback usando apenas metadados
                            enhanced_chat['preview'] = {
                                'first_user_message': 'Conversa disponível',
                                'last_assistant_message': 'Clique para carregar',
                                'message_count': message_count,
                                'has_thinking': chat.get('thinking', False)
                            }
                    else:
                        enhanced_chat['preview'] = {
                            'first_user_message': '',
                            'last_assistant_message': '',
                            'message_count': 0,
                            'has_thinking': False
                        }
                    
                    # Adicionar metadados úteis (usando dados dos metadados)
                    enhanced_chat['metadata'] = {
                        'created_at_formatted': chat.get('created_at', ''),
                        'updated_at_formatted': chat.get('updated_at', ''),
                        'conversation_length': message_count,
                        'has_context': bool(chat.get('context_data'))
                    }
                    
                    enhanced_chats.append(enhanced_chat)
            
            return jsonify({
                'status': 'sucesso', 
                'chats': enhanced_chats,
                'total': len(enhanced_chats),
                'session_preview': {
                    'session_id': session_id,
                    'total_conversations': len(enhanced_chats),
                    'total_messages': sum(chat.get('preview', {}).get('message_count', 0) for chat in enhanced_chats)
                }
            })
        
        elif request.method == 'POST':
            # Verificar se é um teste de diagnóstico
            chat_data = request.get_json()
            if not chat_data:
                return jsonify({'status': 'erro', 'message': 'Dados do chat não fornecidos'}), 400
            
            # DIAGNÓSTICO - se receber test: true
            if chat_data.get('test') == True:
                try:
                    logger.info(f"🔬 Executando diagnóstico - Session ID: {session_id}")
                    
                    # Testar criação de diretórios
                    session_dir = chat_manager._get_safe_session_dir(session_id)
                    logger.info(f"📂 Diretório de sessão: {session_dir}")
                    
                    return jsonify({
                        'status': 'sucesso',
                        'diagnostic': True,
                        'session_id': session_id,
                        'session_dir': str(session_dir),
                        'data_received': True,
                        'base_dir_exists': chat_manager.base_history_dir.exists(),
                        'messages_count': len(chat_data.get('messages', []))
                    })
                except Exception as e:
                    logger.error(f"❌ Erro no diagnóstico: {str(e)}")
                    return jsonify({
                        'status': 'erro',
                        'diagnostic': True,
                        'message': f'Erro no diagnóstico: {str(e)}',
                        'session_id': session_id
                    })
            
            # Salvar chat normal
            
            # Garantir que tem session_id
            chat_data['session_id'] = session_id
            
            # Gerar título inteligente se necessário
            if not chat_data.get('title') or chat_data['title'] == 'Nova Conversa':
                chat_data['title'] = generate_smart_title(chat_data.get('messages', []))
            
            # Salvar usando chat_manager
            result = chat_manager.save_chat(chat_data)
            
            if result['status'] == 'sucesso':
                return jsonify({
                    'status': 'sucesso',
                    'message': 'Chat salvo com sucesso',
                    'chat_id': result.get('chat_id'),
                    'title': chat_data.get('title')
                })
            else:
                return jsonify(result), 500
                
    except Exception as e:
        logger.error(f"Erro na API de chats: {str(e)}")
        return jsonify({'status': 'erro', 'message': 'Erro interno do servidor'}), 500

@main_bp.route('/api/chats/<chat_id>/context', methods=['GET'])
def get_chat_context(chat_id):
    """Carregar contexto completo de um chat específico"""
    try:
        # Obter session_id
        session_id = session.get('titan_session_id')
        if not session_id:
            return jsonify({'status': 'erro', 'message': 'Sessão não encontrada'}), 400
        
        # Buscar chat específico
        chat = chat_manager.get_chat_by_id(chat_id, session_id=session_id)
        if not chat:
            return jsonify({'status': 'erro', 'message': 'Chat não encontrado'}), 404
        
        # Preparar contexto completo
        context_data = {
            'chat_id': chat_id,
            'title': chat.get('title', 'Sem título'),
            'messages': chat.get('messages', []),
            'created_at': chat.get('created_at'),
            'updated_at': chat.get('updated_at'),
            'thinking_enabled': chat.get('thinking_enabled', False),
            'context_summary': generate_context_summary(chat.get('messages', [])),
            'conversation_stats': {
                'total_messages': len(chat.get('messages', [])),
                'user_messages': len([m for m in chat.get('messages', []) if m.get('role') == 'user']),
                'assistant_messages': len([m for m in chat.get('messages', []) if m.get('role') == 'assistant']),
                'has_thinking': any(m.get('thinking') for m in chat.get('messages', []) if m.get('role') == 'assistant')
            }
        }
        
        return jsonify({
            'status': 'sucesso',
            'context': context_data
        })
        
    except Exception as e:
        logger.error(f"Erro ao carregar contexto do chat {chat_id}: {str(e)}")
        return jsonify({'status': 'erro', 'message': 'Erro interno do servidor'}), 500

def generate_context_summary(messages):
    """Gera resumo do contexto da conversa"""
    try:
        if not messages or len(messages) == 0:
            return "Conversa vazia"
        
        # Coletar temas da conversa
        topics = []
        user_messages = [m for m in messages if m.get('role') == 'user']
        
        if user_messages:
            # Pegar primeiras palavras-chave das mensagens do usuário
            for msg in user_messages[:3]:  # Primeiras 3 mensagens
                content = msg.get('content', '')
                words = content.lower().split()[:5]  # Primeiras 5 palavras
                if words:
                    topics.extend(words)
        
        # Limpar e formatear tópicos
        filtered_topics = [t for t in topics if len(t) > 3 and t.isalpha()][:5]
        
        if filtered_topics:
            summary = f"Tópicos: {', '.join(filtered_topics)}"
        else:
            # Fallback para primeira mensagem
            first_msg = messages[0].get('content', '')[:50] if messages else ''
            summary = f"Início: {first_msg}..." if first_msg else "Conversa sem contexto claro"
        
        return summary
        
    except Exception as e:
        logger.error(f"Erro ao gerar resumo de contexto: {str(e)}")
        return "Erro ao processar contexto"

@main_bp.route('/api/chats/auto-save', methods=['POST'])
def auto_save_chat():
    """Salvamento automático durante a conversa"""
    try:
        # Obter session_id
        session_id = session.get('titan_session_id')  # Usando a sessão correta
        if not session_id:
            return jsonify({'status': 'erro', 'message': 'Sessão não encontrada'}), 400
        
        # Obter dados da conversa atual
        chat_data = request.get_json()
        if not chat_data:
            return jsonify({'status': 'erro', 'message': 'Dados do chat não fornecidos'}), 400
        
        # Gerar ID único se não existir
        if not chat_data.get('id'):
            import uuid
            chat_data['id'] = str(uuid.uuid4())
        
        # Garantir session_id
        chat_data['session_id'] = session_id
        
        # Adicionar timestamps
        now = datetime.now().isoformat()
        if not chat_data.get('created_at'):
            chat_data['created_at'] = now
        chat_data['updated_at'] = now
        
        # Título rápido primeiro, IA depois (assíncrono)
        if not chat_data.get('title') or chat_data['title'] == 'Nova Conversa':
            # Título rápido baseado na primeira mensagem
            messages = chat_data.get('messages', [])
            if messages and len(messages) > 0:
                first_msg = next((msg for msg in messages if msg.get('role') == 'user'), None)
                if first_msg:
                    chat_data['title'] = first_msg.get('content', 'Nova Conversa')[:40] + '...'
                else:
                    chat_data['title'] = 'Nova Conversa'
            else:
                chat_data['title'] = 'Nova Conversa'
            
            # Marcar para geração de título IA posterior
            chat_data['needs_ai_title'] = True
        
        # Salvar com chat_manager
        logger.info(f"Salvando chat via chat_manager: {chat_data['id']}")
        try:
            result = chat_manager.save_chat(chat_data)
            logger.info(f"Resultado do chat_manager: {result}")
        except Exception as e:
            logger.error(f"Erro no chat_manager.save_chat: {str(e)}")
            return jsonify({
                'status': 'erro', 
                'message': f'Erro no chat_manager: {str(e)}'
            }), 500
        
        if result['status'] == 'sucesso':
            return jsonify({
                'status': 'sucesso',
                'message': 'Chat salvo automaticamente',
                'chat_id': chat_data['id'],
                'title': chat_data.get('title'),
                'auto_saved': True
            })
        else:
            logger.error(f"Erro retornado pelo chat_manager: {result}")
            return jsonify(result), 500
            
    except Exception as e:
        logger.error(f"Erro no salvamento automático: {str(e)}")
        import traceback
        logger.error(f"Stack trace: {traceback.format_exc()}")
        return jsonify({'status': 'erro', 'message': f'Erro no salvamento automático: {str(e)}'}), 500

@main_bp.route('/api/chats/<chat_id>/update-title', methods=['POST'])
def update_chat_title_async(chat_id):
    """Atualizar título do chat de forma assíncrona"""
    try:
        session_id = session.get('titan_session_id')
        if not session_id:
            return jsonify({'status': 'erro', 'message': 'Sessão não encontrada'}), 400
        
        # Buscar chat
        chat = chat_manager.get_chat_by_id(chat_id, session_id=session_id)
        if not chat:
            return jsonify({'status': 'erro', 'message': 'Chat não encontrado'}), 404
        
        # Gerar título inteligente
        try:
            new_title = generate_smart_title(chat.get('messages', []))
            chat['title'] = new_title
            chat['needs_ai_title'] = False
            
            # Salvar apenas se título foi gerado
            result = chat_manager.save_chat(chat)
            
            if result['status'] == 'sucesso':
                return jsonify({
                    'status': 'sucesso',
                    'title': new_title,
                    'chat_id': chat_id
                })
            else:
                return jsonify(result), 500
                
        except Exception as e:
            logger.error(f"Erro ao gerar título para {chat_id}: {str(e)}")
            return jsonify({'status': 'erro', 'message': 'Erro ao gerar título'}), 500
            
    except Exception as e:
        logger.error(f"Erro ao atualizar título: {str(e)}")
        return jsonify({'status': 'erro', 'message': str(e)}), 500

@main_bp.route('/api/chats/<chat_id>/load', methods=['GET'])
def load_chat(chat_id):
    """Carregar chat específico com contexto completo"""
    try:
        # Obter session_id
        session_id = session.get('titan_session_id')
        if not session_id:
            return jsonify({'status': 'erro', 'message': 'Sessão não encontrada'}), 400
        
        # Buscar chat específico
        chat = chat_manager.get_chat_by_id(chat_id, session_id=session_id)
        if not chat:
            return jsonify({'status': 'erro', 'message': 'Chat não encontrado'}), 404
        
        return jsonify({
            'status': 'sucesso',
            'chat': chat,
            'loaded': True
        })
        
    except Exception as e:
        logger.error(f"Erro ao carregar chat {chat_id}: {str(e)}")
        return jsonify({'status': 'erro', 'message': 'Erro interno do servidor'}), 500

@main_bp.route('/api/chats/test', methods=['POST'])
def test_chat_save():
    """Endpoint de teste para diagnóstico"""
    try:
        # Verificar sessão
        session_id = session.get('titan_session_id')
        logger.info(f"Session ID da requisição: {session_id}")
        
        if not session_id:
            return jsonify({'status': 'erro', 'message': 'Sessão não encontrada'}), 400
        
        # Verificar dados recebidos
        chat_data = request.get_json()
        logger.info(f"Dados recebidos: {chat_data}")
        
        # Testar criação de diretórios
        try:
            from models.chat_manager import chat_manager
            logger.info(f"Chat manager base dir: {chat_manager.base_history_dir}")
            
            # Tentar criar diretório de sessão
            session_dir = chat_manager._get_safe_session_dir(session_id)
            logger.info(f"Diretório de sessão criado: {session_dir}")
            
            return jsonify({
                'status': 'sucesso',
                'session_id': session_id,
                'session_dir': str(session_dir),
                'data_received': chat_data is not None,
                'base_dir_exists': chat_manager.base_history_dir.exists()
            })
        except Exception as e:
            logger.error(f"Erro no teste de diretórios: {str(e)}")
            return jsonify({
                'status': 'erro',
                'message': f'Erro no chat_manager: {str(e)}',
                'session_id': session_id
            })
            
    except Exception as e:
        logger.error(f"Erro no teste: {str(e)}")
        return jsonify({'status': 'erro', 'message': str(e)}), 500