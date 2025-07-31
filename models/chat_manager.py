import json
import shutil
import os
import re
from datetime import datetime
from pathlib import Path
from config import CHAT_HISTORY_FILE, BACKUPS_DIR, EXPORTS_DIR, MAX_BACKUPS

class ChatManager:
    def __init__(self):
        self.base_history_dir = Path(CHAT_HISTORY_FILE).parent / "sessions"
        self.base_history_dir.mkdir(parents=True, exist_ok=True) # Habilitado para sistema de histórico
        
        # SEGURANÇA: Diretório base absoluto para validação
        self.safe_base_path = self.base_history_dir.resolve()
        print(f" ChatManager inicializado - Diretório SEGURO: {self.safe_base_path}")
        
        # Nova estrutura: arquivos individuais por chat
        self.metadata_filename = "metadata.json"
        self.chat_prefix = "chat_"
    
    def _validate_session_id(self, session_id):
        """CRÍTICO: Validação rigorosa de session_id"""
        if not session_id:
            raise ValueError("session_id é obrigatório")
        
        # 1. Verificar tipo
        if not isinstance(session_id, str):
            raise ValueError("session_id deve ser string")
        
        # 2. Verificar tamanho (UUIDs têm ~36 chars)
        if len(session_id) < 10 or len(session_id) > 50:
            raise ValueError("session_id com tamanho inválido")
        
        # 3. CRÍTICO: Bloquear caracteres de path traversal
        dangerous_chars = ['..', '/', '\\', '\0', ':', '*', '?', '"', '<', '>', '|']
        for char in dangerous_chars:
            if char in session_id:
                raise ValueError(f"session_id contém caractere proibido: {char}")
        
        # 4. Apenas alphanúmerico, hífens e underscores
        if not re.match(r'^[a-zA-Z0-9_-]+$', session_id):
            raise ValueError("session_id contém caracteres inválidos")
        
        # 5. Não pode começar com pontos
        if session_id.startswith('.'):
            raise ValueError("session_id não pode começar com ponto")
        
        return session_id
    
    def _get_safe_session_dir(self, session_id):
        """CRÍTICO: Criação segura de diretório de sessão"""
        # 1. Validar session_id primeiro
        safe_session_id = self._validate_session_id(session_id)
        
        # 2. Usar apenas os primeiros 8 caracteres (mais seguro)
        safe_prefix = safe_session_id[:8]
        
        # 3. Construir caminho de forma segura
        session_dir = self.safe_base_path / safe_prefix
        
        # 4. CRÍTICO: Resolver o caminho e verificar se está dentro do base
        resolved_session_dir = session_dir.resolve()
        
        # 5. Verificar se o caminho final está dentro do diretório seguro
        try:
            resolved_session_dir.relative_to(self.safe_base_path)
        except ValueError:
            raise ValueError(f"Tentativa de path traversal detectada: {session_id}")
        
        # 6. Criar diretório se não existir
        resolved_session_dir.mkdir(exist_ok=True)
        
        print(f"Diretório seguro criado: {resolved_session_dir}")
        return resolved_session_dir
    
    def _get_metadata_file(self, session_id):
        """BLINDADO: Retorna arquivo de metadados da sessão"""
        try:
            # 1. Obter diretório seguro
            session_dir = self._get_safe_session_dir(session_id)
            
            # 2. Nome do arquivo fixo (não baseado em input do usuário)
            safe_filename = self.metadata_filename
            
            # 3. Construir caminho final
            metadata_file = session_dir / safe_filename
            
            # 4. Validação final de segurança
            resolved_file = metadata_file.resolve()
            
            # 5. Verificar se o arquivo está dentro do diretório da sessão
            try:
                resolved_file.relative_to(session_dir)
            except ValueError:
                raise ValueError("Tentativa de escapar do diretório da sessão")
            
            return resolved_file
            
        except Exception as e:
            print(f" SECURITY ALERT: Tentativa de acesso inseguro - session_id: {session_id[:20]}...")
            print(f" Erro: {str(e)}")
            raise ValueError("Acesso negado por motivos de segurança")
    
    def _get_chat_file(self, session_id, chat_id):
        """BLINDADO: Retorna arquivo específico de um chat"""
        try:
            # 1. Obter diretório seguro
            session_dir = self._get_safe_session_dir(session_id)
            
            # 2. Sanitizar chat_id
            safe_chat_id = self._sanitize_filename(str(chat_id))
            if not safe_chat_id or len(safe_chat_id) > 50:
                raise ValueError("chat_id inválido")
            
            # 3. Nome do arquivo com prefixo seguro
            safe_filename = f"{self.chat_prefix}{safe_chat_id}.json"
            
            # 4. Construir caminho final
            chat_file = session_dir / safe_filename
            
            # 5. Validação final de segurança
            resolved_file = chat_file.resolve()
            
            # 6. Verificar se o arquivo está dentro do diretório da sessão
            try:
                resolved_file.relative_to(session_dir)
            except ValueError:
                raise ValueError("Tentativa de escapar do diretório da sessão")
            
            return resolved_file
            
        except Exception as e:
            print(f" SECURITY ALERT: Tentativa de acesso inseguro - chat_id: {str(chat_id)[:20]}...")
            print(f" Erro: {str(e)}")
            raise ValueError("Acesso negado por motivos de segurança")
    
    def _sanitize_filename(self, filename):
        """Sanitização de nomes de arquivo"""
        if not filename or not isinstance(filename, str):
            return "arquivo_seguro"
        
        # Remover caracteres perigosos
        filename = re.sub(r'[^\w\s\-_\.]', '', filename)
        
        # Limitar tamanho
        filename = filename[:50]
        
        # Garantir que não está vazio
        if not filename.strip():
            filename = "arquivo_seguro"
        
        # Não pode começar com ponto
        if filename.startswith('.'):
            filename = "arquivo_" + filename[1:]
        
        return filename
    
    def _load_metadata(self, session_id):
        """Carregar metadados da sessão"""
        try:
            metadata_file = self._get_metadata_file(session_id)
            
            if metadata_file.exists():
                with open(metadata_file, 'r', encoding='utf-8') as f:
                    metadata = json.load(f)
                
                if not isinstance(metadata, dict):
                    print(f" Metadados inválidos para sessão {session_id[:8]}...")
                    return {'chats': [], 'last_updated': None}
                
                return metadata
            
            # Arquivo não existe, criar estrutura padrão
            return {'chats': [], 'last_updated': None}
            
        except Exception as e:
            print(f" Erro ao carregar metadados da sessão {session_id[:8]}...: {str(e)[:100]}")
            return {'chats': [], 'last_updated': None}
    
    def _save_metadata(self, session_id, metadata):
        """Salvar metadados da sessão"""
        try:
            metadata_file = self._get_metadata_file(session_id)
            metadata['last_updated'] = datetime.now().isoformat()
            
            with open(metadata_file, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, ensure_ascii=False, indent=2)
            
            os.chmod(metadata_file, 0o600)
            return True
            
        except Exception as e:
            print(f" Erro ao salvar metadados da sessão {session_id[:8]}...: {str(e)[:100]}")
            return False
    
    def _load_single_chat(self, session_id, chat_id):
        """Carregar um chat específico"""
        try:
            chat_file = self._get_chat_file(session_id, chat_id)
            
            if chat_file.exists():
                # Verificar tamanho do arquivo
                file_size = chat_file.stat().st_size
                if file_size > 5 * 1024 * 1024:  # 5MB máximo por chat
                    print(f" Chat muito grande: {file_size} bytes")
                    return None
                
                with open(chat_file, 'r', encoding='utf-8') as f:
                    chat_data = json.load(f)
                
                if not isinstance(chat_data, dict):
                    print(f" Estrutura inválida do chat {chat_id}")
                    return None
                
                return chat_data
            
            return None
            
        except Exception as e:
            print(f" Erro ao carregar chat {chat_id} da sessão {session_id[:8]}...: {str(e)[:100]}")
            return None
    
    def _save_single_chat(self, session_id, chat_data):
        """Salvar um chat específico"""
        try:
            chat_id = chat_data.get('id')
            if not chat_id:
                print(" Chat sem ID não pode ser salvo")
                return False
            
            chat_file = self._get_chat_file(session_id, chat_id)
            
            # Criar backup se arquivo existe
            if chat_file.exists():
                backup_content = chat_file.read_text(encoding='utf-8')
                backup_file = chat_file.with_suffix('.json.backup')
                backup_file.write_text(backup_content, encoding='utf-8')
            
            with open(chat_file, 'w', encoding='utf-8') as f:
                json.dump(chat_data, f, ensure_ascii=False, indent=2)
            
            os.chmod(chat_file, 0o600)
            return True
            
        except Exception as e:
            print(f" Erro ao salvar chat {chat_data.get('id', 'unknown')} da sessão {session_id[:8]}...: {str(e)[:100]}")
            return False
    
    def load_history(self, session_id=None):
        """SEGURO: Carregar histórico (metadados) da sessão específica"""
        if not session_id:
            return []
        
        try:
            # Verificar e executar auto-migração se necessário
            migration_result = self.auto_migrate_if_needed(session_id)
            if migration_result.get('status') == 'erro':
                print(f" Erro na migração da sessão {session_id[:8]}...: {migration_result.get('message')}")
            elif migration_result.get('migrated_count', 0) > 0:
                print(f" ✅ Auto-migração concluída: {migration_result.get('migrated_count')} chats migrados")
            
            # Carregar metadados
            metadata = self._load_metadata(session_id)
            chats_info = metadata.get('chats', [])
            
            if not chats_info:
                print(f" Nenhum histórico para sessão {session_id[:8]}... - criando novo")
                return []
            
            # Retornar apenas os metadados dos chats (não o conteúdo completo)
            # Isso melhora drasticamente a performance
            print(f" Histórico (metadados) carregado da sessão {session_id[:8]}...: {len(chats_info)} conversas")
            return chats_info
            
        except Exception as e:
            print(f" Erro SEGURO ao carregar histórico da sessão {session_id[:8]}...: {str(e)[:100]}")
            return []
    
    def save_history(self, chat_history, session_id=None):
        """DEPRECIADO: Use save_chat() para salvar chats individuais"""
        print("⚠️  AVISO: save_history() está depreciado. Use save_chat() para cada conversa individual.")
        
        if not session_id or not isinstance(chat_history, list):
            return False
        
        # Migração temporária: salvar cada chat individualmente
        success_count = 0
        for chat in chat_history:
            if isinstance(chat, dict) and chat.get('id'):
                result = self.save_chat(chat)
                if result.get('status') == 'sucesso':
                    success_count += 1
        
        print(f" Migração: {success_count}/{len(chat_history)} chats salvos individualmente")
        return success_count > 0
    
    def _get_safe_backup_dir(self, session_id):
        """Diretório seguro para backups"""
        safe_session_id = self._validate_session_id(session_id)
        backup_base = Path(BACKUPS_DIR).resolve()
        backup_dir = backup_base / safe_session_id[:8]
        
        # Verificar se está dentro do diretório de backup
        resolved_backup = backup_dir.resolve()
        try:
            resolved_backup.relative_to(backup_base)
        except ValueError:
            raise ValueError("Tentativa de path traversal em backup")
        
        resolved_backup.mkdir(parents=True, exist_ok=True)
        return resolved_backup
    
    def _create_backup(self, session_id):
        """SEGURO: Criar backup automático da sessão"""
        try:
            session_file = self._get_session_file(session_id)
            if not session_file.exists():
                return
            
            # Gerar timestamp seguro
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            # Sanitizar timestamp (paranoia)
            timestamp = re.sub(r'[^\w]', '_', timestamp)
            
            backup_dir = self._get_safe_backup_dir(session_id)
            backup_filename = f'backup_{timestamp}.json'
            backup_file = backup_dir / backup_filename
            
            # Verificar se backup file está seguro
            resolved_backup_file = backup_file.resolve()
            try:
                resolved_backup_file.relative_to(backup_dir)
            except ValueError:
                raise ValueError("Tentativa de escapar diretório de backup")
            
            shutil.copy2(session_file, resolved_backup_file)
            
            # Permissões seguras
            os.chmod(resolved_backup_file, 0o600)
            
            # Limpar backups antigos da sessão
            self._cleanup_old_backups(session_id)
            print(f" Backup SEGURO criado para sessão {session_id[:8]}...: {backup_file.name}")
            
        except Exception as e:
            print(f" Erro SEGURO ao criar backup da sessão {session_id[:8]}...: {str(e)[:100]}")
    
    def _cleanup_old_backups(self, session_id):
        """SEGURO: Manter apenas os últimos backups da sessão"""
        try:
            backup_dir = self._get_safe_backup_dir(session_id)
            
            # Listar apenas arquivos .json que começam com 'backup_'
            backups = []
            for file in backup_dir.iterdir():
                if (file.is_file() and 
                    file.name.startswith('backup_') and 
                    file.name.endswith('.json') and
                    len(file.name) < 50):  # Limitar tamanho do nome
                    backups.append(file)
            
            # Ordenar por data de modificação
            backups.sort(key=lambda x: x.stat().st_mtime)
            
            # Remover backups antigos
            while len(backups) > MAX_BACKUPS:
                oldest = backups.pop(0)
                # Verificação final antes de deletar
                if oldest.parent == backup_dir:
                    oldest.unlink()
                    print(f"Backup antigo removido SEGURAMENTE da sessão {session_id[:8]}...: {oldest.name}")
                
        except Exception as e:
            print(f" Erro SEGURO ao limpar backups da sessão {session_id[:8]}...: {str(e)[:100]}")
    
    def get_chat_by_id(self, chat_id, session_id=None):
        """SEGURO: Buscar chat por ID APENAS na sessão específica"""
        if not session_id:
            print(" session_id é obrigatório para buscar chat")
            return None
        
        if not chat_id or not isinstance(chat_id, str):
            print(" chat_id inválido")
            return None
        
        # Limitar tamanho do chat_id
        if len(chat_id) > 100:
            print(" chat_id muito longo")
            return None
        
        try:
            # Verificar se o chat existe nos metadados primeiro
            metadata = self._load_metadata(session_id)
            chat_exists = any(chat.get('id') == chat_id for chat in metadata.get('chats', []))
            
            if not chat_exists:
                print(f" Chat {chat_id[:20]} não encontrado nos metadados da sessão {session_id[:8]}...")
                return None
            
            # Carregar o chat completo do arquivo individual
            chat_data = self._load_single_chat(session_id, chat_id)
            
            if chat_data:
                # Verificação DUPLA de segurança
                if chat_data.get('session_id') != session_id:
                    print(f" ALERTA DE SEGURANÇA: Chat {chat_id[:20]} com session_id inconsistente!")
                    return None
                print(f" Chat {chat_id[:20]} carregado da sessão {session_id[:8]}...")
                return chat_data
            
            print(f" Chat {chat_id[:20]} não foi possível carregar da sessão {session_id[:8]}...")
            return None
            
        except Exception as e:
            print(f" Erro ao buscar chat {chat_id[:20]} da sessão {session_id[:8]}...: {str(e)[:100]}")
            return None
    
    def save_chat(self, chat_data):
        """SEGURO: Salvar conversa específica NA SESSÃO CORRETA (nova estrutura)"""
        session_id = chat_data.get('session_id') if isinstance(chat_data, dict) else None
        
        if not session_id:
            print(" session_id é obrigatório no chat_data")
            return {'status': 'erro', 'message': 'session_id é obrigatório'}
        
        # Validar estrutura do chat_data
        if not isinstance(chat_data, dict):
            return {'status': 'erro', 'message': 'chat_data deve ser um dicionário'}
        
        # Validar campos obrigatórios
        required_fields = ['id', 'title', 'messages']
        for field in required_fields:
            if field not in chat_data:
                return {'status': 'erro', 'message': f'Campo obrigatório ausente: {field}'}
        
        # Sanitizar dados
        chat_data['title'] = self._sanitize_filename(str(chat_data.get('title', 'Sem título')))
        
        # Limitar tamanho das mensagens
        if isinstance(chat_data.get('messages'), list):
            if len(chat_data['messages']) > 500:
                chat_data['messages'] = chat_data['messages'][:500]
        
        chat_id = chat_data.get('id')
        
        try:
            # 1. Carregar metadados existentes
            metadata = self._load_metadata(session_id)
            chats_info = metadata.get('chats', [])
            
            # 2. Verificar se é atualização ou nova conversa
            existing_index = next((i for i, chat in enumerate(chats_info) 
                                  if isinstance(chat, dict) and chat.get('id') == chat_id), -1)
            
            # 3. Preparar metadados do chat (sem conteúdo das mensagens)
            chat_metadata = {
                'id': chat_data.get('id'),
                'title': chat_data.get('title'),
                'session_id': session_id,
                'created_at': chat_data.get('created_at'),
                'updated_at': datetime.now().isoformat(),
                'message_count': len(chat_data.get('messages', [])),
                'thinking': chat_data.get('thinking', False),
                'pinned': chat_data.get('pinned', False)
            }
            
            if existing_index >= 0:
                # Atualizar conversa existente nos metadados
                chats_info[existing_index] = chat_metadata
                action = 'atualizada'
                print(f" Conversa atualizada SEGURAMENTE na sessão {session_id[:8]}...: {chat_data.get('title', 'Sem título')[:30]}")
            else:
                # Nova conversa - adicionar ao início
                chats_info.insert(0, chat_metadata)
                action = 'criada'
                print(f" Nova conversa criada SEGURAMENTE na sessão {session_id[:8]}...: {chat_data.get('title', 'Sem título')[:30]}")
            
            # 4. Salvar o chat individual
            if not self._save_single_chat(session_id, chat_data):
                return {'status': 'erro', 'message': 'Erro ao salvar chat individual'}
            
            # 5. Atualizar metadados
            metadata['chats'] = chats_info
            if not self._save_metadata(session_id, metadata):
                return {'status': 'erro', 'message': 'Erro ao salvar metadados'}
            
            print(f" Chat e metadados salvos para sessão {session_id[:8]}...: {len(chats_info)} conversas")
            return {'status': 'sucesso', 'action': action, 'chat_id': chat_id}
        
        except Exception as e:
            print(f" Erro SEGURO ao salvar chat da sessão {session_id[:8]}...: {str(e)[:100]}")
            return {'status': 'erro', 'message': 'Erro ao salvar'}
    
    def delete_chat(self, chat_id, session_id=None):
        """SEGURO: Excluir chat APENAS da sessão específica (nova estrutura)"""
        if not session_id:
            print(" session_id é obrigatório para deletar chat")
            return {'status': 'erro', 'message': 'session_id é obrigatório'}
        
        if not chat_id or not isinstance(chat_id, str) or len(chat_id) > 100:
            print(" chat_id inválido")
            return {'status': 'erro', 'message': 'chat_id inválido'}
        
        try:
            # 1. Carregar metadados
            metadata = self._load_metadata(session_id)
            chats_info = metadata.get('chats', [])
            
            # 2. Encontrar o chat nos metadados
            chat_to_delete = None
            filtered_chats = []
            
            for chat in chats_info:
                if not isinstance(chat, dict):
                    continue
                    
                if chat.get('id') == chat_id:
                    # Verificação DUPLA de segurança
                    if chat.get('session_id') != session_id:
                        print(f" ALERTA DE SEGURANÇA: Tentativa de deletar chat de outra sessão!")
                        return {'status': 'erro', 'message': 'Chat não encontrado ou sem permissão'}
                    chat_to_delete = chat
                else:
                    filtered_chats.append(chat)
            
            if not chat_to_delete:
                return {'status': 'erro', 'message': 'Conversa não encontrada'}
            
            # 3. Remover arquivo individual do chat
            try:
                chat_file = self._get_chat_file(session_id, chat_id)
                if chat_file.exists():
                    # Criar backup antes de deletar
                    backup_content = chat_file.read_text(encoding='utf-8')
                    backup_file = chat_file.with_suffix('.json.deleted')
                    backup_file.write_text(backup_content, encoding='utf-8')
                    
                    # Deletar arquivo original
                    chat_file.unlink()
                    print(f" Arquivo do chat {chat_id[:20]} removido da sessão {session_id[:8]}...")
            except Exception as e:
                print(f" Erro ao remover arquivo do chat: {str(e)[:100]}")
                return {'status': 'erro', 'message': 'Erro ao remover arquivo do chat'}
            
            # 4. Atualizar metadados
            metadata['chats'] = filtered_chats
            if not self._save_metadata(session_id, metadata):
                return {'status': 'erro', 'message': 'Erro ao salvar metadados'}
            
            print(f"Conversa excluída SEGURAMENTE da sessão {session_id[:8]}...: {chat_to_delete.get('title', 'Sem título')[:30]}")
            return {'status': 'sucesso', 'message': 'Conversa excluída'}
            
        except Exception as e:
            print(f" Erro SEGURO ao deletar chat da sessão {session_id[:8]}...: {str(e)[:100]}")
            return {'status': 'erro', 'message': 'Erro ao deletar'}
    
    def export_chat(self, chat_id, session_id=None):
        """SEGURO: Exportar conversa específica DA SESSÃO"""
        if not session_id:
            return {'status': 'erro', 'message': 'session_id é obrigatório'}
        
        if not chat_id or not isinstance(chat_id, str) or len(chat_id) > 100:
            return {'status': 'erro', 'message': 'chat_id inválido'}
        
        chat = self.get_chat_by_id(chat_id, session_id=session_id)
        if not chat:
            return {'status': 'erro', 'message': 'Conversa não encontrada'}
        
        try:
            # Timestamp seguro
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            timestamp = re.sub(r'[^\w]', '_', timestamp)
            
            # Título seguro
            safe_title = self._sanitize_filename(chat.get('title', 'conversa'))
            if len(safe_title) > 30:
                safe_title = safe_title[:30]
            
            # Nome do arquivo seguro
            filename = f"chat_{session_id[:8]}_{safe_title}_{timestamp}.json"
            filename = re.sub(r'[^\w\-_\.]', '_', filename)
            
            # Diretório de export seguro
            export_base = Path(EXPORTS_DIR).resolve()
            export_path = export_base / filename
            
            # Verificar se está dentro do diretório de export
            resolved_export = export_path.resolve()
            try:
                resolved_export.relative_to(export_base)
            except ValueError:
                raise ValueError("Tentativa de path traversal em export")
            
            # Criar diretório se necessário
            export_base.mkdir(parents=True, exist_ok=True)
            
            with open(resolved_export, 'w', encoding='utf-8') as f:
                json.dump(chat, f, ensure_ascii=False, indent=2)
            
            # Permissões seguras
            os.chmod(resolved_export, 0o600)
            
            print(f"Conversa exportada SEGURAMENTE da sessão {session_id[:8]}...: {filename}")
            return {
                'status': 'sucesso',
                'filename': filename,
                'path': str(resolved_export)
            }
            
        except Exception as e:
            print(f" Erro SEGURO ao exportar da sessão {session_id[:8]}...: {str(e)[:100]}")
            return {'status': 'erro', 'message': 'Erro ao exportar'}
    
    def create_manual_backup(self, session_id=None):
        """SEGURO: Criar backup manual DA SESSÃO"""
        if not session_id:
            return {'status': 'erro', 'message': 'session_id é obrigatório'}
        
        try:
            history = self.load_history(session_id=session_id)
            
            # Timestamp seguro
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            timestamp = re.sub(r'[^\w]', '_', timestamp)
            
            backup_dir = self._get_safe_backup_dir(session_id)
            backup_filename = f'manual_backup_{timestamp}.json'
            backup_file = backup_dir / backup_filename
            
            # Verificação final de segurança
            resolved_backup_file = backup_file.resolve()
            try:
                resolved_backup_file.relative_to(backup_dir)
            except ValueError:
                raise ValueError("Tentativa de escapar diretório de backup")
            
            with open(resolved_backup_file, 'w', encoding='utf-8') as f:
                json.dump(history, f, ensure_ascii=False, indent=2)
            
            # Permissões seguras
            os.chmod(resolved_backup_file, 0o600)
            
            print(f" Backup manual SEGURO criado para sessão {session_id[:8]}...: {backup_file.name}")
            return {
                'status': 'sucesso',
                'filename': backup_file.name,
                'total_chats': len(history)
            }
            
        except Exception as e:
            print(f" Erro SEGURO ao criar backup manual da sessão {session_id[:8]}...: {str(e)[:100]}")
            return {'status': 'erro', 'message': 'Erro ao criar backup'}
    
    def get_stats(self, session_id=None):
        """SEGURO: Estatísticas DA SESSÃO ESPECÍFICA"""
        if not session_id:
            return {'status': 'erro', 'message': 'session_id é obrigatório'}
        
        try:
            history = self.load_history(session_id=session_id)
            
            if not history:
                return {
                    'session_id': session_id[:8] + "...",
                    'total_chats': 0,
                    'total_messages': 0,
                    'oldest_chat': None,
                    'newest_chat': None,
                    'file_size': 0
                }
            
            # Calcular estatísticas com validação
            total_messages = 0
            dates = []
            
            for chat in history:
                if isinstance(chat, dict):
                    messages = chat.get('messages', [])
                    if isinstance(messages, list):
                        total_messages += len(messages)
                    
                    created_at = chat.get('created_at')
                    if created_at and isinstance(created_at, str):
                        dates.append(created_at)
            
            session_file = self._get_session_file(session_id)
            file_size = session_file.stat().st_size if session_file.exists() else 0
            
            return {
                'session_id': session_id[:8] + "...",
                'total_chats': len(history),
                'total_messages': total_messages,
                'oldest_chat': min(dates) if dates else None,
                'newest_chat': max(dates) if dates else None,
                'file_size': min(file_size, 100 * 1024 * 1024)  # Limitar retorno
            }
            
        except Exception as e:
            print(f" Erro SEGURO ao obter estatísticas da sessão {session_id[:8]}...: {str(e)[:100]}")
            return {'status': 'erro', 'message': 'Erro ao obter estatísticas'}
    
    def migrate_legacy_chats(self, session_id):
        """Migrar chats da estrutura antiga (chats.json) para nova estrutura (arquivos individuais)"""
        try:
            # 1. Verificar se existe arquivo legacy
            session_dir = self._get_safe_session_dir(session_id)
            legacy_file = session_dir / "chats.json"
            
            if not legacy_file.exists():
                print(f" Nenhum arquivo legacy encontrado para sessão {session_id[:8]}...")
                return {'status': 'sucesso', 'message': 'Nenhuma migração necessária'}
            
            # 2. Carregar dados legacy
            with open(legacy_file, 'r', encoding='utf-8') as f:
                legacy_chats = json.load(f)
            
            if not isinstance(legacy_chats, list):
                print(f" Estrutura legacy inválida para sessão {session_id[:8]}...")
                return {'status': 'erro', 'message': 'Estrutura legacy inválida'}
            
            # 3. Migrar cada chat para arquivo individual
            migrated_count = 0
            metadata_chats = []
            
            for chat in legacy_chats:
                if not isinstance(chat, dict) or not chat.get('id'):
                    continue
                
                try:
                    # Garantir que o chat tem session_id
                    chat['session_id'] = session_id
                    
                    # Salvar chat individual
                    if self._save_single_chat(session_id, chat):
                        # Criar metadados
                        chat_metadata = {
                            'id': chat.get('id'),
                            'title': chat.get('title', 'Chat Migrado'),
                            'session_id': session_id,
                            'created_at': chat.get('created_at'),
                            'updated_at': datetime.now().isoformat(),
                            'message_count': len(chat.get('messages', [])),
                            'thinking': chat.get('thinking', False),
                            'pinned': chat.get('pinned', False)
                        }
                        metadata_chats.append(chat_metadata)
                        migrated_count += 1
                
                except Exception as e:
                    print(f" Erro ao migrar chat {chat.get('id', 'unknown')}: {str(e)[:100]}")
                    continue
            
            # 4. Salvar metadados
            metadata = {'chats': metadata_chats}
            if not self._save_metadata(session_id, metadata):
                return {'status': 'erro', 'message': 'Erro ao salvar metadados'}
            
            # 5. Fazer backup do arquivo legacy
            backup_file = legacy_file.with_suffix('.json.migrated')
            legacy_file.rename(backup_file)
            
            print(f" Migração concluída para sessão {session_id[:8]}...: {migrated_count} chats")
            return {
                'status': 'sucesso', 
                'message': f'Migração concluída: {migrated_count} chats',
                'migrated_count': migrated_count,
                'backup_file': str(backup_file)
            }
        
        except Exception as e:
            print(f" Erro na migração da sessão {session_id[:8]}...: {str(e)[:100]}")
            return {'status': 'erro', 'message': f'Erro na migração: {str(e)[:100]}'}
    
    def auto_migrate_if_needed(self, session_id):
        """Verificar e migrar automaticamente se necessário"""
        try:
            session_dir = self._get_safe_session_dir(session_id)
            legacy_file = session_dir / "chats.json"
            metadata_file = self._get_metadata_file(session_id)
            
            # Se existe legacy e não existe metadata, migrar
            if legacy_file.exists() and not metadata_file.exists():
                print(f" Auto-migração detectada para sessão {session_id[:8]}...")
                return self.migrate_legacy_chats(session_id)
            
            return {'status': 'sucesso', 'message': 'Nenhuma migração necessária'}
        
        except Exception as e:
            print(f" Erro na auto-migração da sessão {session_id[:8]}...: {str(e)[:100]}")
            return {'status': 'erro', 'message': 'Erro na verificação de migração'}

# Instância global SEGURA
chat_manager = ChatManager()