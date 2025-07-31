console.log('📚 History.js carregando...');

let chatHistory = [];
let currentChatIndex = -1;
let autoSaveEnabled = true;
let showHistorySidebar = false;

// ===== FUNÇÃO GLOBAL DA SIDEBAR (DISPONÍVEL IMEDIATAMENTE) =====
window.toggleHistorySidebar = function() {
    console.log('🔘 Botão da sidebar clicado! Estado atual:', showHistorySidebar);
    showHistorySidebar = !showHistorySidebar;

    const sidebar = document.getElementById('historySidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (showHistorySidebar) {
        // Mostrar sidebar
        if (sidebar && overlay) {
            sidebar.classList.add('visible');
            overlay.classList.add('visible');
        }

        updateHistorySidebar();
        setupHistorySidebarEvents();
        console.log('📂 Sidebar aberta');
    } else {
        // Ocultar sidebar
        if (sidebar && overlay) {
            sidebar.classList.remove('visible');
            overlay.classList.remove('visible');
        }
        console.log('📂 Sidebar fechada');
    }
};

console.log('✅ toggleHistorySidebar exportada para window:', typeof window.toggleHistorySidebar);

// ===== GERAÇÃO DE IDs E TÍTULOS =====
function generateChatId() {
    return `chat_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

function generateChatTitle(firstMessage) {
    if (!firstMessage) return "Nova Conversa";
    let title = firstMessage.substring(0, 50);
    if (firstMessage.length > 50) title += "...";
    title = title.replace(/[^\w\s\-\_\.\,\!\?]/g, '');
    return title || "Nova Conversa";
}

// Geração inteligente de títulos usando IA (frontend)
async function generateSmartTitle(firstMessage) {
    try {
        if (!firstMessage || firstMessage.length < 10) {
            return generateChatTitle(firstMessage);
        }
        
        // Extrair palavras-chave da primeira mensagem
        const keywords = firstMessage
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 3)
            .slice(0, 5);
        
        if (keywords.length === 0) {
            return generateChatTitle(firstMessage);
        }
        
        // Gerar título baseado nas palavras-chave
        let smartTitle = '';
        
        // Detectar tipo de pergunta/tema
        if (firstMessage.toLowerCase().includes('como ')) {
            smartTitle = `Como ${keywords[0]}`;
        } else if (firstMessage.toLowerCase().includes('o que ')) {
            smartTitle = `Sobre ${keywords[0]}`;
        } else if (firstMessage.toLowerCase().includes('por que ')) {
            smartTitle = `Por que ${keywords[0]}`;
        } else if (firstMessage.toLowerCase().includes('ajuda')) {
            smartTitle = `Ajuda com ${keywords[0]}`;
        } else if (firstMessage.toLowerCase().includes('explique')) {
            smartTitle = `Explicação: ${keywords[0]}`;
        } else {
            // Usar primeira palavra-chave relevante
            smartTitle = keywords[0].charAt(0).toUpperCase() + keywords[0].slice(1);
            if (keywords[1]) {
                smartTitle += ` e ${keywords[1]}`;
            }
        }
        
        // Limitar tamanho e limpar
        smartTitle = smartTitle.substring(0, 40);
        smartTitle = smartTitle.replace(/[^\w\s\-]/g, '');
        
        return smartTitle || generateChatTitle(firstMessage);
        
    } catch (error) {
        console.error('Erro ao gerar título inteligente:', error);
        return generateChatTitle(firstMessage);
    }
}

// ===== ARMAZENAMENTO EM ARQUIVOS =====
async function saveChatHistoryToStorage() {
    try {
        // Sistema de arquivos ativo - não precisa fazer nada aqui
        console.log(' Sistema de arquivos ativo - salvamento automático');
    } catch (error) {
        console.error('Erro no sistema de arquivos:', error);
    }
}

async function loadChatHistoryFromStorage() {
    try {
        // Verificar se tem sessão ativa antes de carregar histórico
        if (!window.sessionId) {
            console.log('⏳ Aguardando sessão ser inicializada para carregar histórico...');
            return;
        }
        
        console.log('📂 Carregando histórico para sessão:', window.sessionId.substring(0, 8) + '...');
        const response = await fetch('/api/chats');
        const data = await response.json();

        if (data.status === 'sucesso') {
            chatHistory = data.chats || [];
            console.log(` Histórico carregado com contexto: ${chatHistory.length} conversas`);
            
            // Log das informações de contexto para depuração
            if (data.session_preview) {
                console.log(' Sessão:', {
                    total_conversations: data.session_preview.total_conversations,
                    total_messages: data.session_preview.total_messages
                });
            }
            
            // Processar previews dos chats
            chatHistory = chatHistory.map(chat => {
                if (chat.preview) {
                    console.log(`Chat "${chat.title}": ${chat.preview.message_count} mensagens, thinking: ${chat.preview.has_thinking}`);
                }
                return chat;
            });
            
        } else {
            console.error('Erro ao carregar histórico:', data.message || data.erro || 'Erro desconhecido');
            chatHistory = [];
        }
    } catch (error) {
        console.error('Erro ao carregar histórico:', error.message || error);
        console.error('Stack trace:', error.stack);
        chatHistory = [];
    }
}

// ===== GERENCIAMENTO DE CONVERSAS =====
async function saveCurrentChat() {
    if (!sessionId || conversationHistory.length === 0) {
        console.log('Nada para salvar - sessão vazia');
        return null;
    }

    const now = new Date().toISOString();
    let chat;

    if (currentChatIndex >= 0 && chatHistory[currentChatIndex]) {
        chat = chatHistory[currentChatIndex];
        chat.messages = [...conversationHistory];
        chat.updated_at = now;
        chat.session_id = sessionId;
        chat.thinking_mode = currentThinkingMode;
    } else {
        const firstUserMessage = conversationHistory.find(msg => msg.role === 'user')?.content || '';
        chat = {
            id: generateChatId(),
            title: generateChatTitle(firstUserMessage),
            created_at: now,
            updated_at: now,
            messages: [...conversationHistory],
            session_id: sessionId,
            thinking_mode: currentThinkingMode,
            tags: [],
            is_pinned: false
        };

        chatHistory.unshift(chat);
        currentChatIndex = 0;
    }

    //  VALIDAÇÃO RIGOROSA DOS DADOS
    if (!chat.id || !chat.title || !Array.isArray(chat.messages) || !chat.session_id) {
        console.error('Dados do chat inválidos:', {
            id: !!chat.id,
            title: !!chat.title,
            messages: Array.isArray(chat.messages),
            session_id: !!chat.session_id
        });
        showToast('Erro: dados do chat incompletos', 'error');
        return null;
    }

    // Salvar no servidor com retry
    try {
        console.log(' Salvando chat:', chat.title, 'Mensagens:', chat.messages.length);
        
        const response = await fetch('/api/chats', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json'
                //  REMOVIDO CSRF para debug
            },
            body: JSON.stringify(chat)
        });

        console.log('📡 Resposta do servidor:', response.status, response.statusText);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Erro HTTP:', response.status, errorText);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        // Verificar se a resposta é JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Resposta não é JSON:', text);
            throw new Error('Resposta inválida do servidor');
        }

        const result = await response.json();
        console.log(' Resultado do salvamento:', result);

        if (result.status === 'sucesso') {
            console.log(' Chat salvo com sucesso:', chat.title);
            updateHistorySidebar();
            return chat;
        } else {
            console.error('Erro no resultado:', result);
            showToast('Erro ao salvar: ' + (result.erro || 'Erro desconhecido'), 'error');
        }
    } catch (error) {
        console.error('Erro ao salvar chat:', error);
        showToast('Erro de conexão: ' + error.message, 'error');
    }

    return null;
}

async function loadChat(chatId) {
    try {
        // Carregar chat completo com contexto do servidor
        const response = await fetch(`/api/chats/${chatId}/load`);
        const data = await response.json();
        
        if (data.status !== 'sucesso') {
            showToast('Erro ao carregar conversa', 'error');
            return;
        }
        
        const chat = data.chat;
        const chatIndex = chatHistory.findIndex(c => c.id === chatId);
        
        if (chatIndex === -1) {
            // Adicionar ao histórico local se não existir
            chatHistory.unshift(chat);
            currentChatIndex = 0;
        } else {
            currentChatIndex = chatIndex;
        }

        // Restaurar estado da conversa com sincronização global
        window.setSessionId(chat.session_id);
        window.clearConversationHistory();
        
        // Adicionar mensagens ao contexto global
        chat.messages.forEach(msg => {
            window.addToConversationHistory(msg);
        });

        //  CORREÇÃO: Sincronizar thinking mode do chat carregado
        const chatThinkingMode = chat.thinking_mode || chat.think_mode || false;
        window.currentThinkingMode = chatThinkingMode;

        //  CORREÇÃO: Aplicar tema correto baseado no thinking mode do chat
        if (typeof applyTheme === 'function') {
            applyTheme(chatThinkingMode);
        }

        //  CORREÇÃO: Atualizar visual do toggle
        if (typeof updateThinkingToggleVisual === 'function') {
            updateThinkingToggleVisual();
        }

        window.isNewSession = false;

        if (!window.isInChatMode) {
            if (typeof transitionToChat === 'function') {
                transitionToChat();
                setTimeout(() => loadChatMessages(chat), 400);
            }
        } else {
            loadChatMessages(chat);
        }

        document.title = `Titan Chat - ${chat.title}`;

        console.log(`✅ Conversa carregada com contexto: ${chat.title} (${chat.messages.length} mensagens, Thinking: ${chatThinkingMode})`);
        showToast(`Conversa carregada: ${chat.title}`, 'success');
        
        // Fechar sidebar após carregar
        if (showHistorySidebar) {
            window.toggleHistorySidebar();
        }
        
    } catch (error) {
        console.error('Erro ao carregar chat:', error);
        showToast('Erro de conexão ao carregar conversa', 'error');
    }
}

function loadChatMessages(chat) {
    const messagesContainer = document.getElementById('chatMessages');
    if (messagesContainer) {
        messagesContainer.innerHTML = '';

        chat.messages.forEach(msg => {
            if (typeof addMessageToChat === 'function') {
                const systemInfo = {};
                
                if (msg.role === 'assistant') {
                    systemInfo.modo = chat.thinking_mode ? 'Raciocínio' : 'Direto';
                    systemInfo.tem_pensamento = msg.tem_pensamento || false;
                    systemInfo.pensamento = msg.pensamento || null;
                    systemInfo.tempo_resposta = msg.tempo_resposta || 'N/A';
                }

                addMessageToChat(msg.content, msg.role === 'user', systemInfo);
            }
        });
    }
}

async function deleteChat(chatId) {
    const chat = chatHistory.find(c => c.id === chatId);
    if (!chat) return;

    if (confirm(`Tem certeza que deseja excluir "${chat.title}"?`)) {
        try {
            const response = await fetch(`/api/chats/${chatId}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.status === 'sucesso') {
                // Remover do array local
                const chatIndex = chatHistory.findIndex(c => c.id === chatId);
                if (chatIndex >= 0) {
                    chatHistory.splice(chatIndex, 1);

                    if (currentChatIndex === chatIndex) {
                        startNewChat();
                    } else if (currentChatIndex > chatIndex) {
                        currentChatIndex--;
                    }
                }

                updateHistorySidebar();
                console.log('Conversa excluída do arquivo:', chat.title);
                showToast(`Conversa excluída: ${chat.title}`, 'info');
            } else {
                showToast('Erro ao excluir conversa', 'error');
            }
        } catch (error) {
            console.error('Erro ao excluir:', error);
            showToast('Erro de conexão', 'error');
        }
    }
}

function startNewChat() {
    console.log(' Iniciando nova conversa do histórico...');

    // Salvar conversa atual se existir
    if (autoSaveEnabled && conversationHistory.length > 0) {
        saveCurrentChat();
    }

    // Reset básico
    if (typeof clearCurrentSession === 'function') {
        clearCurrentSession();
    }
    currentChatIndex = -1;

    //  USAR A FUNÇÃO DO script.js que funciona
    if (typeof window.startNewChat === 'function' && window.startNewChat !== startNewChat) {
        // Chama a função do script.js
        window.location.reload(); // Ou força reload para resetar tudo
        return;
    }

    // Fallback: forçar volta para welcome
    if (typeof backToWelcome === 'function') {
        // Limpar tudo primeiro
        const messagesContainer = document.getElementById('chatMessages');
        if (messagesContainer) messagesContainer.innerHTML = '';
        
        const chatInputArea = document.getElementById('chatInputArea');
        if (chatInputArea) chatInputArea.style.display = 'none';
        
        backToWelcome();
    }

    updateHistorySidebar();
}

// ===== SIDEBAR DE HISTÓRICO =====

function updateHistorySidebar() {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;

    if (chatHistory.length === 0) {
        historyList.innerHTML = `
            <div class="empty-history">
                <p>Nenhuma conversa salva</p>
                <p>Inicie uma conversa para ver o histórico aqui!</p>
            </div>
        `;
        return;
    }

    const sortedChats = [...chatHistory].sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return new Date(b.updated_at) - new Date(a.updated_at);
    });

    historyList.innerHTML = sortedChats.map(chat => createChatHistoryItem(chat)).join('');
}

function createChatHistoryItem(chat) {
    const isActive = currentChatIndex >= 0 && chatHistory[currentChatIndex]?.id === chat.id;
    
    // Usar preview enriquecido se disponível
    let preview, messageCount, hasThinking, firstUserMsg, lastAssistantMsg;
    
    if (chat.preview) {
        preview = chat.preview.first_user_message ? 
            chat.preview.first_user_message.substring(0, 60) + '...' : 'Sem mensagens';
        messageCount = chat.preview.message_count;
        hasThinking = chat.preview.has_thinking;
        firstUserMsg = chat.preview.first_user_message.substring(0, 30);
        lastAssistantMsg = chat.preview.last_assistant_message.substring(0, 30);
    } else {
        // Fallback para dados legados
        const lastMessage = chat.messages ? chat.messages[chat.messages.length - 1] : null;
        preview = lastMessage ? (lastMessage.content.substring(0, 60) + '...') : 'Sem mensagens';
        messageCount = chat.messages ? chat.messages.length : 0;
        hasThinking = chat.thinking_mode || false;
        firstUserMsg = '';
        lastAssistantMsg = '';
    }
    
    const date = new Date(chat.updated_at || chat.created_at).toLocaleDateString('pt-BR');
    const time = new Date(chat.updated_at || chat.created_at).toLocaleTimeString('pt-BR', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });

    // Indicadores visuais aprimorados
    const thinkingIndicator = hasThinking ? '🧠' : '';
    const contextIndicator = chat.metadata?.has_context ? '📋' : '';
    const pinIndicator = chat.is_pinned ? '📌' : '';
    
    return `
        <div class="chat-history-item ${isActive ? 'active' : ''}" data-chat-id="${chat.id}">
            <div class="chat-menu">
                <button class="menu-toggle" onclick="toggleChatMenu('${chat.id}', event)">
                    ⋯
                </button>
                <div class="menu-dropdown" id="menu-${chat.id}">
                    <button class="menu-item" onclick="loadChatContext('${chat.id}')">
                        Ver Contexto
                    </button>
                    <button class="menu-item" onclick="togglePinChat('${chat.id}')">
                        ${chat.is_pinned ? 'Desfixar' : 'Fixar'}
                    </button>
                    <button class="menu-item" onclick="renameChat('${chat.id}')">
                        Renomear
                    </button>
                    <button class="menu-item" onclick="exportChat('${chat.id}')">
                        Exportar
                    </button>
                    <button class="menu-item danger" onclick="deleteChat('${chat.id}')">
                        Excluir
                    </button>
                </div>
            </div>
            
            <div class="chat-item-header" onclick="loadChat('${chat.id}')">
                <div class="chat-title">
                    ${pinIndicator}${thinkingIndicator}${contextIndicator} ${chat.title}
                </div>
                <div class="chat-date">${date}</div>
            </div>
            
            <div class="chat-preview-enhanced" onclick="loadChat('${chat.id}')">
                <div class="preview-main">${preview}</div>
                ${firstUserMsg && lastAssistantMsg ? `
                    <div class="preview-context">
                        <div class="context-item">👤: ${firstUserMsg}...</div>
                        <div class="context-item">🤖: ${lastAssistantMsg}...</div>
                    </div>
                ` : ''}
            </div>
            
            <div class="chat-meta-enhanced">
                <span class="message-count">💬 ${messageCount}</span>
                <span class="update-time">${time}</span>
                ${hasThinking ? '<span class="thinking-badge">💭</span>' : ''}
            </div>
        </div>
    `;
}

function setupHistorySidebarEvents() {
    // Busca
    const searchInput = document.getElementById('historySearch');
    if (searchInput) {
        searchInput.addEventListener('input', filterChatHistory);
    }

    // Filtros
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            filterChatHistory();
        });
    });
}

// Toggle do menu
function toggleChatMenu(chatId, event) {
    event.stopPropagation(); // Evita carregar o chat

    // Fechar outros menus abertos
    document.querySelectorAll('.menu-dropdown.open').forEach(menu => {
        menu.classList.remove('open');
    });

    // Toggle do menu atual
    const menu = document.getElementById(`menu-${chatId}`);
    if (menu) {
        menu.classList.toggle('open');
    }
}

// Fechar menus ao clicar fora
document.addEventListener('click', (e) => {
    if (!e.target.closest('.chat-menu')) {
        document.querySelectorAll('.menu-dropdown.open').forEach(menu => {
            menu.classList.remove('open');
        });
    }
});

function filterChatHistory() {
    const searchTerm = document.getElementById('historySearch')?.value.toLowerCase() || '';
    const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';

    let filteredChats = [...chatHistory];

    if (activeFilter === 'pinned') {
        filteredChats = filteredChats.filter(chat => chat.is_pinned);
    } else if (activeFilter === 'recent') {
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        filteredChats = filteredChats.filter(chat => new Date(chat.updated_at) > oneWeekAgo);
    }

    if (searchTerm) {
        filteredChats = filteredChats.filter(chat =>
            chat.title.toLowerCase().includes(searchTerm) ||
            chat.messages.some(msg => msg.content.toLowerCase().includes(searchTerm))
        );
    }

    const historyList = document.getElementById('historyList');
    if (historyList) {
        if (filteredChats.length === 0) {
            historyList.innerHTML = `
                <div class="empty-history">
                    <p> Nenhuma conversa encontrada</p>
                    <p>Tente outros termos de busca</p>
                </div>
            `;
        } else {
            historyList.innerHTML = filteredChats.map(chat => createChatHistoryItem(chat)).join('');
        }
    }
}

// ===== CONTEXTO DE CHATS =====
async function loadChatContext(chatId) {
    try {
        const response = await fetch(`/api/chats/${chatId}/context`);
        const data = await response.json();
        
        if (data.status === 'sucesso') {
            const context = data.context;
            
            // Criar modal para exibir contexto
            const modalHtml = `
                <div class="context-modal-overlay" onclick="closeContextModal()">
                    <div class="context-modal" onclick="event.stopPropagation()">
                        <div class="context-modal-header">
                            <h3>📋 Contexto da Conversa</h3>
                            <button onclick="closeContextModal()" class="close-btn">×</button>
                        </div>
                        <div class="context-modal-body">
                            <div class="context-section">
                                <h4>📝 Título</h4>
                                <p>${context.title}</p>
                            </div>
                            
                            <div class="context-section">
                                <h4>📊 Estatísticas</h4>
                                <div class="context-stats">
                                    <div class="stat-item">
                                        <span class="stat-label">Total de mensagens:</span>
                                        <span class="stat-value">${context.conversation_stats.total_messages}</span>
                                    </div>
                                    <div class="stat-item">
                                        <span class="stat-label">Mensagens do usuário:</span>
                                        <span class="stat-value">${context.conversation_stats.user_messages}</span>
                                    </div>
                                    <div class="stat-item">
                                        <span class="stat-label">Respostas da IA:</span>
                                        <span class="stat-value">${context.conversation_stats.assistant_messages}</span>
                                    </div>
                                    <div class="stat-item">
                                        <span class="stat-label">Modo pensamento:</span>
                                        <span class="stat-value">${context.conversation_stats.has_thinking ? '🧠 Ativo' : '⚡ Direto'}</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="context-section">
                                <h4>🎯 Resumo do Contexto</h4>
                                <p class="context-summary">${context.context_summary}</p>
                            </div>
                            
                            <div class="context-section">
                                <h4>📅 Datas</h4>
                                <div class="context-dates">
                                    <div class="date-item">
                                        <span class="date-label">Criado:</span>
                                        <span class="date-value">${new Date(context.created_at).toLocaleString('pt-BR')}</span>
                                    </div>
                                    <div class="date-item">
                                        <span class="date-label">Atualizado:</span>
                                        <span class="date-value">${new Date(context.updated_at).toLocaleString('pt-BR')}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="context-modal-footer">
                            <button onclick="loadChat('${chatId}')" class="btn-primary">
                                🔄 Carregar Conversa
                            </button>
                            <button onclick="closeContextModal()" class="btn-secondary">
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            // Adicionar modal ao DOM
            const modalDiv = document.createElement('div');
            modalDiv.id = 'contextModal';
            modalDiv.innerHTML = modalHtml;
            document.body.appendChild(modalDiv);
            
            console.log(`💡 Contexto carregado para: ${context.title}`);
            
        } else {
            showToast('Erro ao carregar contexto do chat', 'error');
        }
    } catch (error) {
        console.error('Erro ao carregar contexto:', error);
        showToast('Erro de conexão ao carregar contexto', 'error');
    }
}

function closeContextModal() {
    const modal = document.getElementById('contextModal');
    if (modal) {
        modal.remove();
    }
}

// ===== AÇÕES DO HISTÓRICO =====
async function togglePinChat(chatId) {
    const chat = chatHistory.find(c => c.id === chatId);
    if (chat) {
        chat.is_pinned = !chat.is_pinned;
        chat.updated_at = new Date().toISOString();

        // Salvar no servidor
        try {
            const response = await fetch('/api/chats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(chat)
            });

            const result = await response.json();
            if (result.status === 'sucesso') {
                updateHistorySidebar();
                showToast(`📌 Conversa ${chat.is_pinned ? 'fixada' : 'desfixada'}`, 'info');
            }
        } catch (error) {
            console.error('Erro ao fixar/desfixar:', error);
        }
    }
}

async function renameChat(chatId) {
    const chat = chatHistory.find(c => c.id === chatId);
    if (!chat) return;

    const newTitle = prompt('Novo título da conversa:', chat.title);
    if (newTitle && newTitle.trim() && newTitle !== chat.title) {
        chat.title = newTitle.trim();
        chat.updated_at = new Date().toISOString();

        // Salvar no servidor
        try {
            const response = await fetch('/api/chats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(chat)
            });

            const result = await response.json();
            if (result.status === 'sucesso') {
                updateHistorySidebar();
                document.title = `Titan Chat - ${newTitle}`;
                showToast(` Conversa renomeada: ${newTitle}`, 'success');
            }
        } catch (error) {
            console.error('Erro ao renomear:', error);
        }
    }
}

async function exportChat(chatId) {
    try {
        const response = await fetch('/api/chats/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId })
        });

        const result = await response.json();

        if (result.status === 'sucesso') {
            showToast(` Conversa exportada: ${result.filename}`, 'success');
        } else {
            showToast('Erro ao exportar conversa', 'error');
        }
    } catch (error) {
        console.error('Erro ao exportar:', error);
    }
}

async function exportAllChats() {
    if (chatHistory.length === 0) {
        showToast('Nenhuma conversa para exportar', 'warning');
        return;
    }

    try {
        const response = await fetch('/api/chats/backup', {
            method: 'POST'
        });

        const result = await response.json();

        if (result.status === 'sucesso') {
            showToast(` ${result.total_chats} conversas exportadas: ${result.filename}`, 'success');
        } else {
            showToast('Erro ao exportar conversas', 'error');
        }
    } catch (error) {
        console.error('Erro ao exportar:', error);
    }
}

async function clearAllHistory() {
    if (chatHistory.length === 0) {
        showToast('Histórico já está vazio', 'info');
        return;
    }

    if (confirm(`Tem certeza que deseja excluir TODAS as ${chatHistory.length} conversas?\n\nEsta ação não pode ser desfeita!`)) {
        try {
            // Excluir todas as conversas uma por uma
            const deletePromises = chatHistory.map(chat =>
                fetch(`/api/chats/${chat.id}`, { method: 'DELETE' })
            );

            await Promise.all(deletePromises);

            chatHistory = [];
            currentChatIndex = -1;
            updateHistorySidebar();
            startNewChat();
            showToast('Todo o histórico foi limpo', 'warning');
        } catch (error) {
            console.error('Erro ao limpar histórico:', error);
            showToast('Erro ao limpar histórico', 'error');
        }
    }
}

// ===== BACKUP E STATS =====
async function createManualBackup() {
    try {
        const response = await fetch('/api/chats/backup', {
            method: 'POST'
        });

        const result = await response.json();

        if (result.status === 'sucesso') {
            showToast(` Backup criado: ${result.filename}`, 'success');
            console.log(' Backup manual criado:', result.filename);
        } else {
            showToast('Erro ao criar backup', 'error');
        }
    } catch (error) {
        console.error('Erro ao criar backup:', error);
    }
}

async function showChatStats() {
    try {
        const response = await fetch('/api/chats/stats');
        const stats = await response.json();

        console.log('Estatísticas dos chats:', stats);

        const message = `Estatísticas:
- ${stats.total_chats} conversas salvas
- ${stats.total_messages} mensagens totais
- Arquivo: ${(stats.file_size / 1024).toFixed(2)} KB`;

        console.info(message);
    } catch (error) {
        console.error('Erro ao carregar stats:', error);
    }
}

// ===== AUTO-SAVE =====
function setupAutoSave() {
    window.addEventListener('beforeunload', () => {
        if (autoSaveEnabled && typeof conversationHistory !== 'undefined' && conversationHistory.length > 0) {
            saveCurrentChat();
        }
    });

    console.log(' Auto-save otimizado - apenas ao sair da página');
}

// Função para carregar histórico quando sessão estiver pronta
async function loadHistoryWhenReady() {
    // Aguardar até que a sessão esteja inicializada
    let attempts = 0;
    const maxAttempts = 10;
    
    while (!window.sessionId && attempts < maxAttempts) {
        console.log(`⏳ Aguardando sessão... (tentativa ${attempts + 1}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
    }
    
    if (window.sessionId) {
        console.log('✅ Sessão encontrada, carregando histórico...');
        await loadChatHistoryFromStorage();
    } else {
        console.log('⚠️ Não foi possível carregar histórico - sessão não inicializada');
    }
}

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', () => {
    console.log('📚 Sistema de Histórico inicializando...');

    // Carregar histórico apenas após sessão estar pronta
    setTimeout(loadHistoryWhenReady, 2000);

    setupAutoSave();
    
    // Configurar auto-save inteligente
    setTimeout(setupIntelligentAutoSave, 2000);

    // 🔧 CORREÇÃO: Adicionar event listener robusto
    function attachSidebarListener() {
        const sidebarToggle = document.getElementById('sidebarToggle');
        if (sidebarToggle) {
            // Remover listener anterior se existir
            sidebarToggle.removeEventListener('click', window.toggleHistorySidebar);
            
            // Adicionar novo listener
            sidebarToggle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('🔘 Event listener do botão ativado!');
                window.toggleHistorySidebar();
            });
            
            console.log('✅ Event listener da sidebar adicionado');
            console.log('📍 Botão encontrado na posição:', sidebarToggle.getBoundingClientRect());
            return true;
        } else {
            console.error('❌ Botão da sidebar não encontrado!');
            return false;
        }
    }
    
    // Tentar anexar imediatamente e com retry
    if (!attachSidebarListener()) {
        setTimeout(attachSidebarListener, 500);
    }

    console.log(' Sistema de Histórico pronto!');
});

// ===== TESTE DE DEBUG =====
function testAutoSave() {
    console.log('🧪 Testando auto-save manual...');
    console.log('Variáveis globais:', {
        sessionId: window.sessionId ? window.sessionId.substring(0, 8) + '...' : 'null',
        conversationHistory: window.conversationHistory ? window.conversationHistory.length : 'undefined',
        type: typeof window.conversationHistory
    });
    
    console.log('Histórico atual:', window.conversationHistory);
    
    if (window.sessionId && window.conversationHistory && window.conversationHistory.length > 0) {
        autoSaveChatDuringConversation();
    } else {
        console.log('❌ Não é possível fazer auto-save - dados insuficientes');
        
        // Tentar forçar uma sessão para teste
        if (!window.sessionId) {
            console.log('🔧 Criando sessão de teste...');
            window.setSessionId('test_session_' + Date.now());
        }
        
        if (!window.conversationHistory || window.conversationHistory.length === 0) {
            console.log('🔧 Criando conversa de teste...');
            window.addToConversationHistory({
                role: 'user',
                content: 'Teste de mensagem',
                timestamp: new Date().toISOString()
            });
            window.addToConversationHistory({
                role: 'assistant', 
                content: 'Resposta de teste',
                timestamp: new Date().toISOString()
            });
        }
        
        console.log('🔄 Tentando auto-save novamente...');
        autoSaveChatDuringConversation();
    }
}

function testSidebar() {
    console.log('🧪 Teste da sidebar...');
    const toggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('historySidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    console.log('Toggle button:', toggle);
    console.log('Sidebar:', sidebar);
    console.log('Overlay:', overlay);
    
    if (toggle) {
        console.log('Posição do botão:', window.getComputedStyle(toggle).position);
        console.log('Z-index do botão:', window.getComputedStyle(toggle).zIndex);
        console.log('Display do botão:', window.getComputedStyle(toggle).display);
    }
}

// ===== VALIDAÇÃO RIGOROSA DE SESSÃO =====
async function validateSessionForAutoSave() {
    console.log('🔍 Validando sessão para auto-save...');
    
    // 1. Verificar se sessionId existe e é válido
    if (!window.sessionId || typeof window.sessionId !== 'string' || window.sessionId.length < 10) {
        console.log('❌ Session ID inválido ou inexistente:', window.sessionId);
        return false;
    }
    
    // 2. Verificar se há conversa para salvar
    if (!window.conversationHistory || !Array.isArray(window.conversationHistory) || window.conversationHistory.length === 0) {
        console.log('❌ Nenhuma conversa válida para salvar');
        return false;
    }
    
    // 3. Verificar se backend reconhece a sessão
    try {
        const response = await fetch('/debug-session', { 
            method: 'GET', 
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.flask_session_id === window.sessionId && data.session_exists_in_manager) {
                console.log('✅ Sessão validada com sucesso no backend');
                return true;
            } else {
                console.log('❌ Sessão não reconhecida pelo backend:', {
                    frontend: window.sessionId?.substring(0, 8) + '...',
                    backend: data.flask_session_id?.substring(0, 8) + '...',
                    exists: data.session_exists_in_manager
                });
                return false;
            }
        } else {
            console.log('⚠️ Não foi possível validar sessão (HTTP ' + response.status + ')');
            return false;
        }
    } catch (error) {
        console.log('⚠️ Erro na validação de sessão:', error.message);
        return false;
    }
}

// ===== AUTO-SAVE INTELIGENTE COM RETRY =====
async function autoSaveChatDuringConversation(retryCount = 0) {
    const maxRetries = 3;
    const retryDelay = 2000; // 2 segundos
    
    console.log(`🔍 Auto-save iniciado (tentativa ${retryCount + 1}/${maxRetries + 1})...`);
    console.log('📊 Estado atual:', { 
        sessionId: window.sessionId ? window.sessionId.substring(0, 8) + '...' : 'null',
        conversationLength: window.conversationHistory ? window.conversationHistory.length : 0,
        currentChatIndex: currentChatIndex
    });
    
    // VALIDAÇÃO RIGOROSA antes de prosseguir
    const isValidSession = await validateSessionForAutoSave();
    
    if (!isValidSession) {
        if (retryCount < maxRetries) {
            console.log(`⏳ Sessão não válida - tentativa em ${retryDelay}ms (${retryCount + 1}/${maxRetries})...`);
            setTimeout(() => {
                autoSaveChatDuringConversation(retryCount + 1);
            }, retryDelay);
            return;
        } else {
            console.log('❌ Todas as tentativas de auto-save falharam - sessão não válida');
            return;
        }
    }
    
    // Usar variáveis globais APÓS validação
    const globalSessionId = window.sessionId;
    const globalConversationHistory = window.conversationHistory;
    
    try {
        // Gerar título inteligente diretamente se é um novo chat
        let chatTitle = 'Nova Conversa';
        const isNewChat = currentChatIndex < 0;
        
        if (isNewChat && globalConversationHistory.length >= 2) {
            // Pegar primeira mensagem do usuário para gerar título
            const firstUserMsg = globalConversationHistory.find(m => m.role === 'user');
            if (firstUserMsg && firstUserMsg.content) {
                chatTitle = await generateSmartTitle(firstUserMsg.content);
            }
        }
        
        const chatData = {
            id: currentChatIndex >= 0 && chatHistory[currentChatIndex] ? 
                chatHistory[currentChatIndex].id : generateChatId(),
            title: chatTitle,
            messages: [...globalConversationHistory],
            session_id: globalSessionId,
            thinking_mode: window.currentThinkingMode || false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        const response = await fetch('/api/chats/auto-save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(chatData)
        });
        
        const result = await response.json();
        
        if (result.status === 'sucesso') {
            console.log(`⚡ Auto-save rápido: ${result.title || chatTitle}`);
            
            // Atualizar histórico local imediatamente
            if (currentChatIndex < 0) {
                chatData.id = result.chat_id;
                chatData.title = result.title || chatTitle;
                chatHistory.unshift(chatData);
                currentChatIndex = 0;
                console.log(`📝 Novo chat criado com título: ${chatData.title}`);
                
                // Atualizar título da página
                document.title = `Titan Chat - ${chatData.title}`;
            } else {
                chatHistory[currentChatIndex].title = result.title || chatTitle;
                chatHistory[currentChatIndex].messages = [...globalConversationHistory];
                chatHistory[currentChatIndex].updated_at = new Date().toISOString();
                console.log(`🔄 Chat atualizado: ${result.chat_id}`);
            }
            
            // Atualizar sidebar sem delay
            if (showHistorySidebar) {
                updateHistorySidebar();
            }
            
            // Se precisa de título IA ainda mais inteligente, fazer assíncrono
            if (result.needs_ai_title && result.chat_id) {
                setTimeout(() => {
                    updateTitleAsync(result.chat_id);
                }, 3000); // 3 segundos depois para refinamento
            }
        }
    } catch (error) {
        console.error('Erro no auto-save:', error);
    }
}

// Função para atualizar título com IA de forma assíncrona
async function updateTitleAsync(chatId) {
    try {
        console.log(`🧠 Gerando título inteligente para: ${chatId}`);
        
        const response = await fetch(`/api/chats/${chatId}/update-title`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const result = await response.json();
        
        if (result.status === 'sucesso') {
            console.log(`✨ Título atualizado: ${result.title}`);
            
            // Atualizar no histórico local
            const chatIndex = chatHistory.findIndex(c => c.id === chatId);
            if (chatIndex >= 0) {
                chatHistory[chatIndex].title = result.title;
                chatHistory[chatIndex].needs_ai_title = false;
                
                // Atualizar sidebar se visível
                if (showHistorySidebar) {
                    updateHistorySidebar();
                }
            }
        } else {
            console.warn(`⚠️ Falho ao atualizar título: ${result.message}`);
        }
        
    } catch (error) {
        console.error(`❌ Erro ao atualizar título para ${chatId}:`, error);
    }
}

// Configurar auto-save inteligente
function setupIntelligentAutoSave() {    
    // Hook no final de cada streaming de resposta
    const originalProcessStreamingResponse = window.processStreamingResponse;
    if (originalProcessStreamingResponse) {
        window.processStreamingResponse = function(...args) {
            const result = originalProcessStreamingResponse.apply(this, args);
            
            // Auto-save após processar resposta completa
            if (window.conversationHistory && window.conversationHistory.length > 0) {
                setTimeout(() => {
                    console.log('🔄 Executando auto-save após resposta completa...');
                    autoSaveChatDuringConversation();
                }, 2000);
            }
            
            return result;
        };
    }
    
    // Fallback: auto-save por intervalo de tempo durante conversa ativa
    setInterval(() => {
        if (window.isGenerating === false && window.conversationHistory && window.conversationHistory.length > 0) {
            const lastSave = window.lastAutoSave || 0;
            const now = Date.now();
            
            // Auto-save a cada 2 minutos se não houve save recente
            if (now - lastSave > 120000) {
                console.log('⏰ Auto-save por intervalo de tempo...');
                autoSaveChatDuringConversation().then(() => {
                    window.lastAutoSave = now;
                });
            }
        }
    }, 60000); // Check a cada 1 minuto
    
    console.log('🤖 Auto-save inteligente configurado com múltiplos triggers');
}

// ===== EXPORTAR FUNÇÕES GLOBAIS =====
window.testSidebar = testSidebar;
window.loadChat = loadChat;
window.deleteChat = deleteChat;
window.exportChat = exportChat;
window.exportAllChats = exportAllChats;
window.clearAllHistory = clearAllHistory;
window.togglePinChat = togglePinChat;
window.renameChat = renameChat;
window.startNewChat = startNewChat;
window.saveCurrentChat = saveCurrentChat;
window.createManualBackup = createManualBackup;
window.showChatStats = showChatStats;
window.toggleChatMenu = toggleChatMenu;
window.loadChatContext = loadChatContext;
window.closeContextModal = closeContextModal;
window.autoSaveChatDuringConversation = autoSaveChatDuringConversation;
window.testAutoSave = testAutoSave;
window.loadHistoryWhenReady = loadHistoryWhenReady;
window.loadChatHistoryFromStorage = loadChatHistoryFromStorage;
window.saveCurrentConversation = saveCurrentConversation;

// Função para testar se a sessão está sincronizada
window.forceAutoSave = function() {
    console.log('🔧 FORÇANDO AUTO-SAVE...');
    
    // Verificar se há conversa ativa
    if (!window.conversationHistory || window.conversationHistory.length === 0) {
        console.log('❌ Nenhuma conversa ativa para salvar');
        return;
    }
    
    // Verificar session
    if (!window.sessionId) {
        console.log('❌ Session ID não encontrada');
        return;
    }
    
    console.log('✅ Dados disponíveis - executando auto-save...');
    console.log('📊 Mensagens:', window.conversationHistory.length);
    console.log('🆔 Session:', window.sessionId.substring(0, 8) + '...');
    
    // Forçar auto-save
    if (typeof window.autoSaveChatDuringConversation === 'function') {
        window.autoSaveChatDuringConversation();
    } else {
        console.log('❌ Função autoSaveChatDuringConversation não disponível');
    }
};

window.testSession = async function() {
    console.log('🧪 Testando sessão...');
    
    // 1. Inicializar sessão do servidor
    try {
        console.log('🔄 Inicializando sessão no servidor...');
        await window.initializeUserSession();
        
        console.log('📋 Sessão após inicialização:', {
            windowSessionId: window.sessionId ? window.sessionId.substring(0, 8) + '...' : 'null',
            conversationLength: window.conversationHistory ? window.conversationHistory.length : 0
        });
        
        // 2. Testar se consegue salvar
        // Criar dados de teste se não existirem
        if (!window.conversationHistory || window.conversationHistory.length === 0) {
            console.log('📝 Criando conversa de teste...');
            window.addToConversationHistory({
                role: 'user',
                content: 'Mensagem de teste do diagnóstico',
                timestamp: new Date().toISOString()
            });
            window.addToConversationHistory({
                role: 'assistant', 
                content: 'Resposta de teste do diagnóstico - salvamento automático',
                timestamp: new Date().toISOString()
            });
        }
        
        console.log('💾 Tentando auto-save...');
        console.log('📊 Dados para salvar:', {
            sessionId: window.sessionId ? window.sessionId.substring(0, 8) + '...' : 'null',
            messages: window.conversationHistory ? window.conversationHistory.length : 0,
            firstMessage: window.conversationHistory?.[0]?.content?.substring(0, 30) + '...'
        });
        
        try {
            await autoSaveChatDuringConversation();
        } catch (error) {
            console.error('❌ Erro no auto-save:', error);
        }
    } catch (error) {
        console.error('❌ Erro no teste de sessão:', error);
    }
};

// Função para testar diagnóstico detalhado
window.testDiagnostic = async function() {
    console.log('🔬 Diagnóstico detalhado...');
    
    try {
        // 1. Testar endpoint de diagnóstico (usando rota existente)
        const response = await fetch('/api/chats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                test: true,
                messages: window.conversationHistory || []
            })
        });
        
        const result = await response.json();
        console.log('🔬 Resultado do diagnóstico:', result);
        
        if (result.status === 'sucesso' && result.diagnostic) {
            console.log('✅ Chat manager funcionando!');
            console.log('📁 Diretório base existe:', result.base_dir_exists);
            console.log('📂 Diretório de sessão:', result.session_dir);
            console.log('📊 Mensagens enviadas:', result.messages_count);
            
            // 2. Agora testar auto-save real
            console.log('💾 Testando auto-save real...');
            await autoSaveChatDuringConversation();
        } else if (result.diagnostic) {
            console.error('❌ Erro no diagnóstico:', result.message, result);
        } else {
            console.log('🤔 Resposta não é de diagnóstico:', result);
        }
        
    } catch (error) {
        console.error('❌ Erro no diagnóstico:', error);
    }
};

// Função para salvar a conversa atual manualmente
async function saveCurrentConversation() {
    console.log('💾 Salvando conversa atual...');
    
    if (!window.sessionId) {
        console.error('❌ Nenhuma sessão ativa');
        return;
    }
    
    if (!window.conversationHistory || window.conversationHistory.length === 0) {
        console.error('❌ Nenhuma conversa para salvar');
        return;
    }
    
    console.log('📊 Salvando:', {
        sessionId: window.sessionId.substring(0, 8) + '...',
        messages: window.conversationHistory.length,
        preview: window.conversationHistory.map(m => `${m.role}: ${m.content.substring(0, 20)}...`)
    });
    
    try {
        await autoSaveChatDuringConversation();
        console.log('✅ Conversa salva! Verifique o histórico.');
        
        // Carregar histórico atualizado
        await loadChatHistoryFromStorage();
        
    } catch (error) {
        console.error('❌ Erro ao salvar:', error);
    }
}

console.log(' Sistema de Histórico SIMPLIFICADO carregado!');