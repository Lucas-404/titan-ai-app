let chatHistory = [];
let currentChatIndex = -1;
let autoSaveEnabled = true;
let showHistorySidebar = false;

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

// ===== ARMAZENAMENTO EM ARQUIVOS =====
async function saveChatHistoryToStorage() {
    try {
        // Sistema de arquivos ativo - não precisa fazer nada aqui
        console.log('💾 Sistema de arquivos ativo - salvamento automático');
    } catch (error) {
        console.error('❌ Erro no sistema de arquivos:', error);
    }
}

async function loadChatHistoryFromStorage() {
    try {
        const response = await fetch('/api/chats');
        const data = await response.json();

        if (data.status === 'sucesso') {
            chatHistory = data.chats || [];
            console.log(`📂 Histórico carregado do arquivo: ${chatHistory.length} conversas`);
        } else {
            console.error('❌ Erro ao carregar histórico:', data.erro);
            chatHistory = [];
        }
    } catch (error) {
        console.error('❌ Erro ao carregar histórico:', error);
        chatHistory = [];
    }
}

// ===== GERENCIAMENTO DE CONVERSAS =====
async function saveCurrentChat() {
    if (!sessionId || conversationHistory.length === 0) {
        console.log('📝 Nada para salvar - sessão vazia');
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

    // ✅ VALIDAÇÃO RIGOROSA DOS DADOS
    if (!chat.id || !chat.title || !Array.isArray(chat.messages) || !chat.session_id) {
        console.error('❌ Dados do chat inválidos:', {
            id: !!chat.id,
            title: !!chat.title,
            messages: Array.isArray(chat.messages),
            session_id: !!chat.session_id
        });
        showToast('❌ Erro: dados do chat incompletos', 'error');
        return null;
    }

    // Salvar no servidor com retry
    try {
        console.log('💾 Salvando chat:', chat.title, 'Mensagens:', chat.messages.length);
        
        const response = await fetch('/api/chats', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json'
                // ✅ REMOVIDO CSRF para debug
            },
            body: JSON.stringify(chat)
        });

        console.log('📡 Resposta do servidor:', response.status, response.statusText);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Erro HTTP:', response.status, errorText);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        // Verificar se a resposta é JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('❌ Resposta não é JSON:', text);
            throw new Error('Resposta inválida do servidor');
        }

        const result = await response.json();
        console.log('✅ Resultado do salvamento:', result);

        if (result.status === 'sucesso') {
            console.log('💾 Chat salvo com sucesso:', chat.title);
            updateHistorySidebar();
            return chat;
        } else {
            console.error('❌ Erro no resultado:', result);
            showToast('❌ Erro ao salvar: ' + (result.erro || 'Erro desconhecido'), 'error');
        }
    } catch (error) {
        console.error('❌ Erro ao salvar chat:', error);
        showToast('❌ Erro de conexão: ' + error.message, 'error');
    }

    return null;
}

function loadChat(chatId) {
    const chatIndex = chatHistory.findIndex(chat => chat.id === chatId);
    if (chatIndex === -1) {
        showToast('❌ Conversa não encontrada', 'error');
        return;
    }

    const chat = chatHistory[chatIndex];
    currentChatIndex = chatIndex;

    // Restaurar estado da conversa
    sessionId = chat.session_id;
    conversationHistory = [...chat.messages];

    // 🔧 CORREÇÃO: Sincronizar thinking mode do chat carregado
    const chatThinkingMode = chat.thinking_mode || chat.think_mode || false;
    currentThinkingMode = chatThinkingMode;

    // 🔧 CORREÇÃO: Aplicar tema correto baseado no thinking mode do chat
    if (typeof applyTheme === 'function') {
        applyTheme(currentThinkingMode);
    }

    // 🔧 CORREÇÃO: Atualizar visual do toggle
    if (typeof updateThinkingToggleVisual === 'function') {
        updateThinkingToggleVisual();
    }

    isNewSession = false;

    if (!isInChatMode) {
        if (typeof transitionToChat === 'function') {
            transitionToChat();
            setTimeout(() => loadChatMessages(chat), 400);
        }
    } else {
        loadChatMessages(chat);
    }

    document.title = `🤖 Titan Chat - ${chat.title}`;

    console.log(`📂 Conversa carregada: ${chat.title} (Thinking: ${currentThinkingMode})`);
    showToast(`📂 Conversa carregada: ${chat.title}`, 'success');
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
                console.log('🗑️ Conversa excluída do arquivo:', chat.title);
                showToast(`🗑️ Conversa excluída: ${chat.title}`, 'info');
            } else {
                showToast('❌ Erro ao excluir conversa', 'error');
            }
        } catch (error) {
            console.error('❌ Erro ao excluir:', error);
            showToast('❌ Erro de conexão', 'error');
        }
    }
}

function startNewChat() {
    console.log('🆕 Iniciando nova conversa do histórico...');

    // Salvar conversa atual se existir
    if (autoSaveEnabled && conversationHistory.length > 0) {
        saveCurrentChat();
    }

    // Reset básico
    if (typeof clearCurrentSession === 'function') {
        clearCurrentSession();
    }
    currentChatIndex = -1;

    // ✅ USAR A FUNÇÃO DO script.js que funciona
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
function toggleHistorySidebar() {
    showHistorySidebar = !showHistorySidebar;

    const sidebar = document.getElementById('historySidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (showHistorySidebar) {
        // Mostrar sidebar
        if (sidebar) {
            sidebar.style.display = 'flex';
            overlay.style.display = 'block';

            setTimeout(() => {
                sidebar.classList.add('visible');
                overlay.classList.add('visible');
            }, 10);
        }

        updateHistorySidebar();
        setupHistorySidebarEvents();
    } else {
        // Ocultar sidebar
        if (sidebar) {
            sidebar.classList.remove('visible');
            overlay.classList.remove('visible');

            setTimeout(() => {
                sidebar.style.display = 'none';
                overlay.style.display = 'none';
            }, 300);
        }
    }
}

function updateHistorySidebar() {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;

    if (chatHistory.length === 0) {
        historyList.innerHTML = `
            <div class="empty-history">
                <p>📝 Nenhuma conversa salva</p>
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
    const lastMessage = chat.messages[chat.messages.length - 1];
    const preview = lastMessage ? (lastMessage.content.substring(0, 60) + '...') : 'Sem mensagens';
    const messageCount = chat.messages.length;
    const date = new Date(chat.updated_at).toLocaleDateString('pt-BR');

    return `
        <div class="chat-history-item ${isActive ? 'active' : ''}" data-chat-id="${chat.id}">
            <div class="chat-menu">
                <button class="menu-toggle" onclick="toggleChatMenu('${chat.id}', event)">
                    ⋯
                </button>
                <div class="menu-dropdown" id="menu-${chat.id}">
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
                <div class="chat-title">${chat.is_pinned ? '📌 ' : ''}${chat.title}</div>
                <div class="chat-date">${date}</div>
            </div>
            <div class="chat-preview" onclick="loadChat('${chat.id}')">${preview}</div>
            <div class="chat-meta">
                <span class="message-count">💬 ${messageCount}</span>
                <span class="thinking-mode">${chat.thinking_mode ? '🧠' : '⚡'}</span>
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
                    <p>🔍 Nenhuma conversa encontrada</p>
                    <p>Tente outros termos de busca</p>
                </div>
            `;
        } else {
            historyList.innerHTML = filteredChats.map(chat => createChatHistoryItem(chat)).join('');
        }
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
            console.error('❌ Erro ao fixar/desfixar:', error);
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
                showToast(`✏️ Conversa renomeada: ${newTitle}`, 'success');
            }
        } catch (error) {
            console.error('❌ Erro ao renomear:', error);
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
            showToast(`📤 Conversa exportada: ${result.filename}`, 'success');
        } else {
            showToast('❌ Erro ao exportar conversa', 'error');
        }
    } catch (error) {
        console.error('❌ Erro ao exportar:', error);
        showToast('❌ Erro de conexão', 'error');
    }
}

async function exportAllChats() {
    if (chatHistory.length === 0) {
        showToast('📝 Nenhuma conversa para exportar', 'warning');
        return;
    }

    try {
        const response = await fetch('/api/chats/backup', {
            method: 'POST'
        });

        const result = await response.json();

        if (result.status === 'sucesso') {
            showToast(`📤 ${result.total_chats} conversas exportadas: ${result.filename}`, 'success');
        } else {
            showToast('❌ Erro ao exportar conversas', 'error');
        }
    } catch (error) {
        console.error('❌ Erro ao exportar:', error);
        showToast('❌ Erro de conexão', 'error');
    }
}

async function clearAllHistory() {
    if (chatHistory.length === 0) {
        showToast('📝 Histórico já está vazio', 'info');
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
            showToast('🗑️ Todo o histórico foi limpo', 'warning');
        } catch (error) {
            console.error('❌ Erro ao limpar histórico:', error);
            showToast('❌ Erro ao limpar histórico', 'error');
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
            showToast(`💾 Backup criado: ${result.filename}`, 'success');
            console.log('💾 Backup manual criado:', result.filename);
        } else {
            showToast('❌ Erro ao criar backup', 'error');
        }
    } catch (error) {
        console.error('❌ Erro ao criar backup:', error);
        showToast('❌ Erro de conexão', 'error');
    }
}

async function showChatStats() {
    try {
        const response = await fetch('/api/chats/stats');
        const stats = await response.json();

        console.log('📊 Estatísticas dos chats:', stats);

        const message = `📊 Estatísticas:
- ${stats.total_chats} conversas salvas
- ${stats.total_messages} mensagens totais
- Arquivo: ${(stats.file_size / 1024).toFixed(2)} KB`;

        showToast(message, 'info');
    } catch (error) {
        console.error('❌ Erro ao carregar stats:', error);
    }
}

// ===== AUTO-SAVE =====
function setupAutoSave() {
    window.addEventListener('beforeunload', () => {
        if (autoSaveEnabled && typeof conversationHistory !== 'undefined' && conversationHistory.length > 0) {
            saveCurrentChat();
        }
    });

    console.log('✅ Auto-save otimizado - apenas ao sair da página');
}

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', () => {
    console.log('📚 Sistema de Histórico inicializando...');

    // Carregar histórico apenas se a API estiver disponível
    setTimeout(() => {
        loadChatHistoryFromStorage();
    }, 1000);

    setupAutoSave();

    console.log('✅ Sistema de Histórico pronto!');
});

// ===== EXPORTAR FUNÇÕES GLOBAIS =====
window.toggleHistorySidebar = toggleHistorySidebar;
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

console.log('📂 Sistema de Histórico SIMPLIFICADO carregado!');