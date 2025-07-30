// =================== VARIÁVEIS GLOBAIS ===================
const mainInput = document.getElementById('mainInput');
const sendBtn = document.getElementById('sendBtn');
const welcomeContainer = document.querySelector('.welcome-container');
const chatContainer = document.getElementById('chatContainer');
const thinking = document.getElementById('thinking');
const thinkingText = document.getElementById('thinkingText');

let currentThinkingMode = false;
let isInChatMode = false;
let systemStatus = 'connecting';
let settingsTabVisible = false;

// Variáveis de sessão
let sessionId = null;
let conversationHistory = [];
let isNewSession = true;

// Variáveis de controle
let currentRequest = null;
let userMessageCount = 0;
let feedbackShown = false;
let isGenerating = false;

// CSRF Token
let csrfToken = null;

// ===================  FUNÇÕES DE SEGURANÇA ===================
function escapeHtml(text) {
    if (!text || typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function sanitizeAttribute(attr) {
    if (!attr || typeof attr !== 'string') return '';
    return escapeHtml(attr.substring(0, 200));
}

function validateInput(input) {
    if (!input || typeof input !== 'string') return false;
    if (input.length > 2000) {
        showToast('Mensagem muito longa (máximo 2000 caracteres)', 'error');
        return false;
    }
    const dangerousPatterns = [/<\script/i, /javascript:/i, /data:text\/html/i, /vbscript:/i, /on\w+\s*=/i, /<iframe/i, /<object/i, /<embed/i];
    for (const pattern of dangerousPatterns) if (pattern.test(input)) return false;
    return true;
}

function formatMessage(content) {
    if (!content || typeof content !== 'string') return '';
    let safeContent = escapeHtml(content);
    safeContent = safeContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    safeContent = safeContent.replace(/\*(.*?)\*/g, '<em>$1</em>');
    safeContent = safeContent.replace(/`(.*?)`/g, '<code>$1</code>');
    safeContent = safeContent.replace(/\n/g, '<br>');
    return safeContent;
}

// ===================  CSRF TOKEN MANAGEMENT ===================
function initializeCsrfToken() {
    const csrfMeta = document.querySelector('meta[name="csrf-token"]');
    if (csrfMeta) { csrfToken = csrfMeta.getAttribute('content'); console.log(' CSRF token carregado'); }
    else console.log(' CSRF token não encontrado - continuando sem');
}

function getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (csrfToken) headers['X-CSRFToken'] = csrfToken;
    return headers;
}

// =================== FUNÇÃO UTILITÁRIA CONSOLIDADA ===================
function addThinkingCommand(message) {
    const finalMessage = message.trim();
    const hasManualCommand = finalMessage.includes('/think') || finalMessage.includes('/no_think');
    if (!hasManualCommand) return currentThinkingMode ? finalMessage + ' /think' : finalMessage + ' /no_think';
    return finalMessage;
}

// =================== INICIALIZAÇÃO ===================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Titan Chat - Sistema carregado!');
    if (mainInput) { mainInput.disabled = true; mainInput.placeholder = 'Conectando ao servidor...'; }
    initializeCsrfToken();
    createParticles();
    setupEventListeners();
    initializeThinkingMode();
    setupThinkingModeClickOutside();
    initializeFeedbackSystem();
    try {
        await initializeUserSession();
        if (mainInput) { mainInput.disabled = false; mainInput.placeholder = 'Pergunte ao Titan'; mainInput.focus(); }
        initializeCleanWelcome();
        initializeOriginalSystem();
    } catch (error) {
        console.error('Falha crítica na inicialização da sessão:', error);
        if (mainInput) mainInput.placeholder = 'Erro de conexão. Tente recarregar a página.';
        showToast('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.', 'error');
    }
    console.log('✨ Sistema inicializado!');
});

// =================== WELCOME LIMPO ===================
function initializeCleanWelcome() {
    isInChatMode = false;
    if (welcomeContainer) { welcomeContainer.style.display = 'flex'; welcomeContainer.style.opacity = '1'; welcomeContainer.classList.remove('hidden'); }
    if (chatContainer) { chatContainer.style.display = 'none'; chatContainer.style.opacity = '0'; chatContainer.classList.remove('active'); }
    console.log(' Welcome inicializado');
}

// =================== SISTEMA ORIGINAL ===================
async function initializeOriginalSystem() {
    try { await updateSystemStatus(); console.log('🔗 Sistema integrado'); } catch (error) { console.warn(' Erro ao inicializar sistema:', error); }
}

async function updateSystemStatus() {
    try {
        const response = await fetchAPI('/status', { credentials: 'include' });
        const data = await response.json();
        const { usuarios_ativos, maximo_usuarios, disponivel } = data;
        const statusIndicator = document.querySelector('.status-indicator span');
        if (statusIndicator) {
            statusIndicator.textContent = disponivel ? `Online • ${usuarios_ativos}/${maximo_usuarios}` : `Ocupado • ${usuarios_ativos}/${maximo_usuarios}`;
            systemStatus = disponivel ? 'online' : 'busy';
        }
    } catch (error) { systemStatus = 'offline'; const statusIndicator = document.querySelector('.status-indicator span'); if (statusIndicator) statusIndicator.textContent = 'Offline'; }
}

// =================== THINKING MODE ===================
function initializeThinkingMode() {
    currentThinkingMode = false;
    applyTheme(false);
    updateThinkingToggleVisual();
    console.log(' Thinking mode inicializado');
}

function applyTheme(thinkingEnabled) {
    if (thinkingEnabled) document.body.classList.add('thinking-theme');
    else document.body.classList.remove('thinking-theme');
}

function updateThinkingToggleVisual() {
    const toggle = document.getElementById('titanToggle');
    if (toggle) { currentThinkingMode ? toggle.classList.add('active') : toggle.classList.remove('active'); }
    updateDropdownThinkingToggle();
    updateDropdownThinkingToggleChat();
}

// =================== PARTÍCULAS ===================
function createParticles() {
    const particlesContainer = document.getElementById('particles');
    if (!particlesContainer) return;
    particlesContainer.innerHTML = '';
    const particleCount = window.innerWidth < 768 ? 5 : 10;
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = (Math.random() * 80 + 10) + '%';
        particle.style.animationDelay = Math.random() * 15 + 's';
        particle.style.animationDuration = (Math.random() * 10 + 10) + 's';
        const size = Math.random() * 2 + 1;
        particle.style.width = size + 'px';
        particle.style.height = size + 'px';
        particle.style.opacity = Math.random() * 0.3 + 0.1;
        particlesContainer.appendChild(particle);
    }
}

// =================== SISTEMA DE STOP/CANCEL ===================
function updateSendButtonState(generating) {
    isGenerating = generating;
    const sendBtn = document.getElementById('sendBtn');
    const chatSendBtn = document.getElementById('chatSendBtn');
    if (generating) {
        if (sendBtn) { sendBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`; sendBtn.classList.add('stop-mode'); sendBtn.title = 'Parar geração (ESC)'; }
        if (chatSendBtn) { chatSendBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`; chatSendBtn.classList.add('stop-mode'); chatSendBtn.title = 'Parar geração (ESC)'; }
        console.log(' Botões mudaram para modo STOP');
    } else {
        if (sendBtn) { sendBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>`; sendBtn.classList.remove('stop-mode'); sendBtn.title = 'Enviar mensagem (Enter)'; }
        if (chatSendBtn) { chatSendBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>`; chatSendBtn.classList.remove('stop-mode'); chatSendBtn.title = 'Enviar mensagem (Enter)'; }
        console.log('🟢 Botões voltaram para modo SEND');
    }
}

function cancelCurrentRequest() {
    if (currentRequest) {
        console.log('🛑 Cancelando request...');
        try { currentRequest.abort(); } catch (abortError) { console.warn(' Erro ao abortar:', abortError); }
        currentRequest = null;
        fetchAPI('/cancel-request', { method: 'POST', headers: getHeaders(), body: JSON.stringify({ action: 'cancel' }), credentials: 'include' }).catch(error => console.warn(' Backend cancel falhou:', error));
        if (thinking) thinking.style.display = 'none';
        updateSendButtonState(false);
        addMessageToChat('🛑 Geração cancelada', false, { modo: 'Sistema', tempo_resposta: '0ms' });
        console.log(' Request cancelado com sucesso');
        return true;
    }
    console.log('ℹ️ Nenhum request ativo para cancelar');
    return false;
}

// =================== EVENT LISTENERS ===================
function setupEventListeners() {
    if (window.listenersSetup) { console.log(' Event listeners já configurados, ignorando...'); return; }
    window.listenersSetup = true;
    if (mainInput) {
        mainInput.addEventListener('keydown', handleMainInputKeydown);
        mainInput.addEventListener('focus', handleInputFocus);
        mainInput.addEventListener('blur', handleInputBlur);
        mainInput.addEventListener('input', handleInputResize);
    }
    if (sendBtn) sendBtn.addEventListener('click', handleSendMessage);
    const toggleBtn = document.getElementById('titanToggle');
    if (toggleBtn) toggleBtn.addEventListener('click', toggleThinkingClean);
    setupChatInputListeners();
    window.addEventListener('resize', handleWindowResize);
    setInterval(updateSystemStatus, 180000);
    console.log(' Event listeners configurados (protegidos contra duplicação)');
}

function setupChatInputListeners() {
    const chatInput = document.getElementById('chatInput');
    const chatSendBtn = document.getElementById('chatSendBtn');
    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } });
        chatInput.addEventListener('input', function () { this.style.height = 'auto'; this.style.height = this.scrollHeight + 'px'; });
    }
    if (chatSendBtn) chatSendBtn.addEventListener('click', sendChatMessage);
}

function handleMainInputKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
}

function handleInputFocus() {
    const container = mainInput.closest('.main-input-container');
    if (container) { container.style.borderColor = '#10b981'; container.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.15), 0 15px 50px rgba(0, 0, 0, 0.4)'; }
}

function handleInputBlur() {
    const container = mainInput.closest('.main-input-container');
    if (container) { container.style.borderColor = ''; container.style.boxShadow = ''; }
}

function handleInputResize() {
    mainInput.style.height = 'auto';
    mainInput.style.height = mainInput.scrollHeight + 'px';
}

function handleWindowResize() {
    setTimeout(createParticles, 100);
}

// =================== STREAMING REAL ===================
async function handleSendMessage() {
    if (isGenerating && currentRequest) { cancelCurrentRequest(); return; }
    const message = mainInput?.value?.trim();
    if (!message) return;
    console.log('📤 Enviando mensagem:', message);
    const finalMessage = addThinkingCommand(message);
    if (!isInChatMode) {
        transitionToChat();
        setTimeout(() => { addMessageToChat(message, true); sendMessageToServer(finalMessage); }, 350);
    } else {
        addMessageToChat(message, true);
        await sendMessageToServer(finalMessage);
    }
    mainInput.value = '';
    mainInput.style.height = 'auto';
}

async function sendMessageToServer(message) {
    if (!validateInput(message)) return;
    if (!sessionId) startNewSession();
    currentRequest = new AbortController();
    updateSendButtonState(true);
    if (thinking) { thinking.style.display = 'block'; thinkingText.textContent = ''; }
    const streamContainer = createStreamingContainer();
    try {
        const response = await fetchAPI('/chat-stream', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ mensagem: message, thinking_mode: currentThinkingMode }),
            signal: currentRequest.signal,
            credentials: 'include'
        });
        if (response.status === 429) {
            const errorData = await response.json();
            if (errorData.action_required === 'create_account') { showCreateAccountModal(errorData); streamContainer.remove(); return; }
            else { showError(errorData.error); streamContainer.remove(); return; }
        }
        if (response.status === 402) {
            const errorData = await response.json();
            showFeatureRestrictedModal(errorData);
            streamContainer.remove();
            return;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        await processStreamResponse(response, streamContainer);
    } catch (error) {
        if (error.name !== 'AbortError') showError('Falha na comunicação com o servidor');
    } finally {
        currentRequest = null;
        updateSendButtonState(false);
        if (thinking) thinking.style.display = 'none';
    }
}

function showCreateAccountModal(limitData) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `<div class="modal-content"><h3>Limite de Mensagens Atingido!</h3><p>Você usou <strong>${limitData.messages_used}/${limitData.limit}</strong> mensagens gratuitas hoje.</p><p>Crie uma conta <strong>gratuita</strong> para continuar conversando com o Titan!</p><div class="modal-benefits"><h4>✨ Benefícios da conta gratuita:</h4><ul><li>Mais mensagens por dia</li><li>Histórico de conversas</li><li>Memória personalizada</li></ul></div><div class="modal-actions"><button onclick="openRegisterForm()" class="btn btn-primary">Criar Conta Grátis</button><button onclick="closeCreateAccountModal()" class="btn btn-secondary">Talvez Depois</button></div></div>`;
    document.body.appendChild(modal);
    modal.style.display = 'flex';
}

function closeCreateAccountModal() {
    const modal = document.querySelector('.modal');
    if (modal) modal.remove();
}

function openRegisterForm() {
    closeCreateAccountModal();
    console.log('Abrir formulário de registro');
}

function showFeatureRestrictedModal(errorData) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `<div class="modal-content"><h3>Feature Premium</h3><p>${errorData.error}</p>${errorData.action_required === 'create_account' ? '<button onclick="openRegisterForm()" class="btn btn-primary">Criar Conta Grátis</button>' : '<button onclick="showUpgradeModal()" class="btn btn-primary">Ver Planos Premium</button>'}<button onclick="closeFeatureModal()" class="btn btn-secondary">Fechar</button></div>`;
    document.body.appendChild(modal);
    modal.style.display = 'flex';
}

function closeFeatureModal() {
    const modal = document.querySelector('.modal');
    if (modal) modal.remove();
}

async function sendChatMessage() {
    if (isGenerating && currentRequest) { cancelCurrentRequest(); return; }
    const chatInput = document.getElementById('chatInput');
    const message = chatInput?.value?.trim();
    if (!message) return;
    const finalMessage = addThinkingCommand(message);
    console.log('📤 Enviando do chat:', finalMessage);
    addMessageToChat(message, true);
    chatInput.value = '';
    chatInput.style.height = 'auto';
    await sendMessageToServer(finalMessage);
}

async function processStreamResponse(response, container) {
    console.log(' [STREAM] Processando resposta...');
    const reader = response.body.getReader();
    let fullContent = '';
    let thinkingContent = '';
    let chunks = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) { console.log(' [STREAM] Stream completo'); break; }
        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n');
        chunks++;
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                try {
                    const data = JSON.parse(line.slice(6));
                    if (data.type === 'content' && data.content) {
                        fullContent += data.content;
                        // Modificação aqui: Processar o pensamento em tempo real
                        const { thinkingContainer, thinkingScrollElement, thinkingContent: currentThinkingChunk, afterThinkingContent } = processThinkingInRealTime(fullContent, container);
                        
                        // Atualiza o conteúdo principal da mensagem
                        const contentDiv = container.querySelector('.streaming-content');
                        if (contentDiv) contentDiv.innerHTML = formatMessage(afterThinkingContent);

                        // Atualiza o conteúdo do pensamento se o modo de pensamento estiver ativo
                        if (currentThinkingMode && thinkingScrollElement) {
                            updateThinkingContent(thinkingContainer, currentThinkingChunk);
                        }
                    }
                    if (data.type === 'thinking_done' && data.thinking) { thinkingContent = data.thinking; console.log(' [STREAM] Thinking recebido:', thinkingContent.length, 'chars'); }
                    if (data.type === 'error') { if (data.action_required === 'create_account') showCreateAccountModal(data); else showError(data.error); streamContainer.remove(); return; }
                    if (data.type === 'done') { console.log('🏁 [STREAM] Done recebido'); finalizeStreamingMessage(container, fullContent, thinkingContent); return; }
                } catch (e) { console.warn(' [STREAM] Erro no parse:', e); }
            }
        }
    }
    finalizeStreamingMessage(container, fullContent, thinkingContent);
}

// FUNÇÃO PRINCIPAL: PROCESSAR THINKING EM TEMPO REAL
function processThinkingInRealTime(fullContent, container) {
    let insideThinking = false;
    let thinkingContent = '';
    let afterThinkingContent = '';
    let thinkingContainer = null;
    let thinkingScrollElement = null;
    const thinkStartIndex = fullContent.indexOf('<think>');
    const thinkEndIndex = fullContent.indexOf('</think>');
    if (thinkStartIndex !== -1) {
        if (currentThinkingMode && !container.querySelector('.thinking-container')) { thinkingContainer = createThinkingContainerLive(container); thinkingScrollElement = thinkingContainer?.querySelector('.thinking-scroll'); console.log(' Container de thinking criado em tempo real'); }
        if (thinkEndIndex !== -1) { thinkingContent = fullContent.substring(thinkStartIndex + 7, thinkEndIndex); afterThinkingContent = fullContent.substring(thinkEndIndex + 8).trim(); insideThinking = false; console.log('Thinking completo extraído:', thinkingContent.length, 'chars'); }
        else { thinkingContent = fullContent.substring(thinkStartIndex + 7); afterThinkingContent = ''; insideThinking = true; }
        if (!thinkingContainer) thinkingContainer = container.querySelector('.thinking-container');
        if (!thinkingScrollElement) thinkingScrollElement = thinkingContainer?.querySelector('.thinking-scroll');
    } else { afterThinkingContent = fullContent; insideThinking = false; }
    return { insideThinking, thinkingContent, afterThinkingContent, thinkingContainer, thinkingScrollElement };
}

// CRIAR CONTAINER DE THINKING LIVE - TAMANHO FIXO
function createThinkingContainerLive(messageContainer) {
    const assistantDiv = messageContainer.querySelector('.assistant-message');
    if (!assistantDiv) return null;
    const thinkingHTML = `<div class="thinking-container live-thinking"><div class="thinking-header" onclick="toggleThinking(this)"><span class="thinking-icon"></span><span class="thinking-summary">Pensando em tempo real...</span><span class="thinking-toggle">▼</span></div><div class="thinking-content" style="max-height: 0; overflow: hidden; transition: max-height 0.3s ease;"><div class="thinking-scroll" style="height: 200px; overflow-y: auto; padding: 10px; font-size: 13px; line-height: 1.4; color: #e5e7eb; background: rgba(0,0,0,0.2); border-radius: 8px;"></div></div></div>`;
    assistantDiv.insertAdjacentHTML('afterbegin', thinkingHTML);
    const thinkingContainer = assistantDiv.querySelector('.thinking-container');
    console.log(' Container de thinking live criado (fechado, tamanho fixo)');
    return thinkingContainer;
}

// SCROLL INSTANTÂNEO
function scrollToBottom() {
    const messagesContainer = document.getElementById('chatMessages');
    if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// NOVA FUNÇÃO: Atualizar thinking em tempo real
function updateThinkingContent(thinkingContainer, content) {
    if (!thinkingContainer) return;
    const scroll = thinkingContainer.querySelector('.thinking-scroll');
    if (scroll) { scroll.textContent = content; scroll.scrollTop = scroll.scrollHeight; }
}

// FUNÇÕES DE STREAMING REAL
function createStreamingContainer() {
    const messagesContainer = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message streaming-message';
    messageDiv.innerHTML = `<div class="assistant-message"><div class="message-content streaming-content"></div><div class="streaming-cursor">|</div></div>`;
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
    return messageDiv;
}

function updateStreamingContent(container, content) {
    const contentDiv = container.querySelector('.streaming-content');
    if (contentDiv) contentDiv.innerHTML = formatMessage(content);
}

function finalizeStreamingMessage(container, content, thinking = null) {
    container.classList.remove('streaming-message');
    const cursor = container.querySelector('.streaming-cursor');
    if (cursor) cursor.remove();
    const assistantDiv = container.querySelector('.assistant-message');
    if (!assistantDiv) return;

    if (thinking && thinking.trim() && currentThinkingMode) {
        // CORREÇÃO: Limpa o conteúdo da resposta antes de renderizar.
        const cleanContent = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        
        assistantDiv.innerHTML = `<div class="thinking-container"><div class="thinking-header" onclick="toggleThinking(this)"><span class="thinking-icon"></span><span class="thinking-summary">Processo de raciocínio</span><span class="thinking-toggle">▼</span></div><div class="thinking-content"><div class="thinking-scroll">${escapeHtml(thinking)}</div></div></div><div class="message-content">${formatMessage(cleanContent)}</div>`;
        console.log(' Thinking adicionado à mensagem!');
    } else {
        const contentDiv = container.querySelector('.streaming-content');
        if (contentDiv) { 
            const cleanContent = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim(); 
            contentDiv.innerHTML = formatMessage(cleanContent); 
            contentDiv.classList.remove('streaming-content'); 
        }
    }
    setTimeout(() => addMessageActions(container, content, false), 100);
    scrollToBottom();
}

// =================== TRANSIÇÃO PARA CHAT ===================
function transitionToChat() {
    console.log(' Transicionando para chat...');
    isInChatMode = true;
    if (welcomeContainer) {
        welcomeContainer.style.opacity = '0';
        welcomeContainer.style.transform = 'scale(0.95)';
        setTimeout(() => {
            welcomeContainer.style.display = 'none';
            welcomeContainer.classList.add('hidden');
            if (chatContainer) {
                chatContainer.style.display = 'flex';
                chatContainer.style.opacity = '0';
                chatContainer.classList.add('active');
                setupChatInterface();
                setTimeout(() => chatContainer.style.opacity = '1', 50);
            }
        }, 300);
    }
}

function setupChatInterface() {
    const messagesContainer = document.getElementById('chatMessages');
    if (messagesContainer && messagesContainer.children.length === 0) messagesContainer.innerHTML = '';
    const chatInputArea = document.getElementById('chatInputArea');
    if (chatInputArea) { chatInputArea.style.display = 'block'; setTimeout(() => { const chatInput = document.getElementById('chatInput'); if (chatInput) chatInput.focus(); }, 200); }
    console.log(' Interface do chat configurada');
}

// =================== VOLTAR PARA WELCOME ===================
function backToWelcome() {
    console.log(' Voltando para Welcome...');
    if (currentRequest) cancelCurrentRequest();
    isInChatMode = false;
    if (chatContainer) { chatContainer.style.opacity = '0'; chatContainer.classList.remove('active'); }
    setTimeout(() => {
        if (chatContainer) chatContainer.style.display = 'none';
        const chatInputArea = document.getElementById('chatInputArea');
        if (chatInputArea) chatInputArea.style.display = 'none';
        if (welcomeContainer) {
            welcomeContainer.style.display = 'flex';
            welcomeContainer.style.opacity = '0';
            welcomeContainer.style.transform = 'scale(0.95)';
            welcomeContainer.classList.remove('hidden');
            setTimeout(() => { welcomeContainer.style.opacity = '1'; welcomeContainer.style.transform = 'scale(1)'; if (mainInput) { mainInput.value = ''; mainInput.focus(); } }, 50);
        }
    }, 300);
}

// =================== GERENCIAMENTO SEGURO DE MENSAGENS ===================
function addMessageToChat(content, isUser, systemInfo = null) {
    const messagesContainer = document.getElementById('chatMessages');
    if (!messagesContainer) { console.error('Elemento #chatMessages não encontrado no DOM!'); return; }
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    if (isUser) messageDiv.classList.add('user');
    if (isUser) {
        console.log('Adicionando mensagem do usuário:', content);
        const safeContent = escapeHtml(content);
        messageDiv.innerHTML = `<div class="user-message"><div class="message-content">${safeContent}</div></div>`;
    } else {
        const mode = systemInfo?.modo || (currentThinkingMode ? 'Raciocínio' : 'Direto');
        const tempoResposta = systemInfo?.tempo_resposta || '';
        const temPensamento = systemInfo?.tem_pensamento || false;
        const pensamento = systemInfo?.pensamento || '';
        let messageContent = '';
        if (currentThinkingMode && temPensamento && pensamento) {
            const safePensamento = escapeHtml(pensamento);
            const safeContent = formatMessage(content);
            const safeMode = sanitizeAttribute(mode);
            const safeTempoResposta = escapeHtml(tempoResposta);
            messageContent = `<div class="assistant-message message-block" data-mode="${safeMode}"><div class="thinking-container"><div class="thinking-header" onclick="toggleThinking(this)"><span class="thinking-icon"></span><span class="thinking-summary">Pensou por ${safeTempoResposta}</span><span class="thinking-toggle">▼</span></div><div class="thinking-content"><div class="thinking-scroll">${safePensamento}</div></div></div><div class="message-content">${safeContent}</div></div>`;
        } else {
            const safeContent = formatMessage(content);
            const safeMode = sanitizeAttribute(mode);
            const safeTempoResposta = escapeHtml(tempoResposta);
            messageContent = `<div class="assistant-message" data-mode="${safeMode}"><div class="message-content">${safeContent}</div>${tempoResposta ? `<div class="response-time">${safeTempoResposta}</div>` : ''}</div>`;
        }
        messageDiv.innerHTML = messageContent;
    }
    if (!isUser) {
        messagesContainer.appendChild(messageDiv);
        setTimeout(() => addMessageActions(messageDiv, content, false), 50);
    } else messagesContainer.appendChild(messageDiv);
    scrollToBottom();
}

function toggleThinking(header) {
    const container = header.parentElement;
    const content = container.querySelector('.thinking-content');
    const toggle = container.querySelector('.thinking-toggle');
    if (!content || !toggle) { console.error('Elementos thinking-content ou thinking-toggle não encontrados!'); return; }
    if (container.classList.contains('expanded')) { container.classList.remove('expanded'); content.style.maxHeight = '0'; toggle.textContent = '▼'; console.log(' Thinking fechado'); }
    else { container.classList.add('expanded'); content.style.maxHeight = '220px'; toggle.textContent = '▲'; console.log(' Thinking aberto'); }
    scrollToBottom();
}

function showError(message) {
    const safeMessage = escapeHtml(message);
    addMessageToChat(`Erro: ${safeMessage}`, false);
    console.error('Erro no chat:', message);
}

function showQueueMessage(queueInfo) {
    const safeMessage = `Titan está ocupado. Você é o ${escapeHtml(queueInfo.posicao)}º na fila. Tempo estimado: ${escapeHtml(queueInfo.tempo_estimado_str)}`;
    addMessageToChat(safeMessage, false);
    setTimeout(() => { const chatInput = document.getElementById('chatInput'); const lastMessage = chatInput?.value?.trim(); if (lastMessage) sendMessageToServer(lastMessage); }, queueInfo.tempo_estimado * 1000);
}

// =================== ABA DE FERRAMENTAS ===================
function toggleSettingsTab() {
    const settingsTab = document.getElementById('settingsTab');
    if (!settingsTab) return;
    settingsTabVisible = !settingsTabVisible;
    if (settingsTabVisible) settingsTab.classList.add('active');
    else settingsTab.classList.remove('active');
}

function updateSettingsButtonStates() {
    const settingsBtns = document.querySelectorAll('.settings-btn');
    settingsBtns.forEach(btn => settingsTabVisible ? btn.classList.add('active') : btn.classList.remove('active'));
}

// =================== THINKING MODE E PLANO DO USUÁRIO ===================
async function checkUserPlanAndUpdateUI() {
    try {
        const response = await fetchAPI('/api/user-status', { credentials: 'include' });
        const data = await response.json();
        if (data.logged_in) { updateThinkingModeAvailability(data.plan); updateUsageDisplay(data.usage, data.plan); updateUserInfo(data.user, data.plan); }
        else if (data.anonymous) { console.log(' Usuário anônimo detectado - parando loop'); return; }
        else if (!sessionId) await initializeUserSession();
    } catch (error) { console.error('Erro ao verificar plano:', error); }
}

async function initializeUserSession() {
    console.log('🔄 Inicializando sessão...');
    try {
        const response = await fetchAPI('/api/init-session', { method: 'POST', credentials: 'include' });
        if (response.ok) { const data = await response.json(); console.log(' Sessão inicializada:', data); if (data.session_id) sessionId = data.session_id; }
    } catch (error) { console.error('Erro ao inicializar sessão:', error); }
}

function updateThinkingModeForAnonymous() {
    const toggle = document.getElementById('titanToggle');
    if (toggle) toggle.classList.remove('disabled');
    const thinkingBtns = document.querySelectorAll('.dropdown-toggle');
    thinkingBtns.forEach(btn => { btn.classList.remove('disabled'); btn.style.opacity = '1'; });
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') if (isGenerating && currentRequest) cancelCurrentRequest();
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); startNewChat(); }
        if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); showKeyboardShortcuts(); }
    });
    console.log('⌨️ Atalhos de teclado configurados');
}

function updateThinkingModeAvailability(plan) {
    const toggle = document.getElementById('titanToggle');
    const thinkingBtns = document.querySelectorAll('.dropdown-toggle');
    const hasThinkingMode = plan.features.includes('thinking_mode');
    if (!hasThinkingMode) {
        if (toggle) { toggle.classList.add('disabled'); toggle.title = `Thinking Mode disponível no plano ${plan.is_premium ? 'Premium' : 'Básico'}`; if (toggle.classList.contains('active')) { toggle.classList.remove('active'); currentThinkingMode = false; } }
        thinkingBtns.forEach(btn => { btn.classList.add('disabled'); btn.style.opacity = '0.5'; });
        showUpgradeBadge();
    } else {
        if (toggle) { toggle.classList.remove('disabled'); toggle.title = 'Thinking Mode disponível'; }
        thinkingBtns.forEach(btn => { btn.classList.remove('disabled'); btn.style.opacity = '1'; });
        hideUpgradeBadge();
    }
}

function updateUsageDisplay(usage, plan) {
    let usageDisplay = document.getElementById('usage-display');
    if (!usageDisplay) usageDisplay = createUsageDisplay();
    const hourUsed = usage.hour.messages;
    const hourLimit = plan.messages_per_hour;
    const dayUsed = usage.day.messages;
    const dayLimit = plan.messages_per_day;
    const hourPercent = (hourUsed / hourLimit) * 100;
    const dayPercent = (dayUsed / dayLimit) * 100;
    usageDisplay.innerHTML = `<div class="usage-info"><div class="plan-badge">${plan.name}</div><div class="usage-stats"><div class="usage-item ${hourPercent > 80 ? 'warning' : ''}"><span>Hora: ${hourUsed}/${hourLimit}</span><div class="usage-bar"><div class="usage-fill" style="width: ${hourPercent}%"></div></div></div><div class="usage-item ${dayPercent > 80 ? 'warning' : ''}"><span>Hoje: ${dayUsed}/${dayLimit}</span><div class="usage-bar"><div class="usage-fill" style="width: ${dayPercent}%"></div></div></div></div></div>`;
    if (hourPercent > 90) showLimitWarning('Você usou mais de 90% do limite por hora!');
    else if (dayPercent > 90) showLimitWarning('Você usou mais de 90% do limite diário!');
}

function createUsageDisplay() {
    const display = document.createElement('div');
    display.id = 'usage-display';
    display.className = 'usage-display';
    const chatContainer = document.getElementById('chatContainer');
    if (chatContainer) chatContainer.insertBefore(display, chatContainer.firstChild);
    return display;
}

function showUpgradeBadge() {
    let badge = document.getElementById('upgrade-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'upgrade-badge';
        badge.className = 'upgrade-badge';
        badge.innerHTML = `<span>Upgrade para Premium</span><button onclick="showUpgradeModal()">Ver Planos</button>`;
        document.body.appendChild(badge);
    }
    badge.style.display = 'block';
}

function hideUpgradeBadge() {
    const badge = document.getElementById('upgrade-badge');
    if (badge) badge.style.display = 'none';
}

function showLimitWarning(message) {
    const toast = document.createElement('div');
    toast.className = 'toast toast-warning limit-warning';
    toast.innerHTML = `${message}<button onclick="showUpgradeModal()" class="upgrade-btn-small">Fazer Upgrade</button>`;
    document.body.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 5000);
}

function showUpgradeModal() {
    const modal = document.createElement('div');
    modal.className = 'upgrade-modal';
    modal.innerHTML = `<div class="upgrade-modal-content"><div class="upgrade-modal-header"><h3>Desbloqueie o Thinking Mode</h3><button onclick="closeUpgradeModal()" class="close-btn">×</button></div><div class="upgrade-modal-body"><p>O <strong>Thinking Mode</strong> permite que o Titan pense em voz alta por mais tempo para dar respostas mais elaboradas.</p><div class="plans-comparison"><div class="plan-card current"><h4>Seu Plano Atual</h4><div class="plan-price">Gratuito</div><ul><li>10 mensagens/hora</li><li>50 mensagens/dia</li><li>❌ Thinking Mode</li></ul></div><div class="plan-card premium"><h4>Plano Básico</h4><div class="plan-price">R$ 19,90/mês</div><ul><li>100 mensagens/hora</li><li>500 mensagens/dia</li><li>Thinking Mode Ilimitado</li></ul><button onclick="selectPlan('basic')" class="btn-upgrade">Escolher Básico</button></div><div class="plan-card pro"><h4>Plano Pro</h4><div class="plan-price">R$ 49,99/mês</div><ul><li>1000 mensagens/hora</li><li>5000 mensagens/dia</li><li>Thinking Mode + Web Search</li></ul><button onclick="selectPlan('pro')" class="btn-upgrade">Escolher Pro</button></div></div></div></div>`;
    document.body.appendChild(modal);
}

function closeUpgradeModal() {
    const modal = document.querySelector('.upgrade-modal');
    if (modal) modal.remove();
}

async function createStripeCheckout(priceId) {
    try {
        const response = await fetchAPI('/auth/create-checkout-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ price_id: priceId }), credentials: 'include' });
        const data = await response.json();
        if (data.checkout_url) window.location.href = data.checkout_url;
        else alert('Erro ao criar sessão de checkout');
    } catch (error) { alert('Erro: ' + error.message); }
}

window.selectPlan = async function (planType) {
    console.log('🛒 Selecionando plano:', planType);
    const modal = document.querySelector('.upgrade-modal');
    if (modal) modal.remove();
    const priceIds = { 'basic': 'price_1Rb8yJI0nP81FHlVezCBt5jT', 'pro': 'price_1Rb92YI0nP81FHlVGTp9sYKT' };
    const priceId = priceIds[planType];
    if (!priceId) { alert('Plano inválido: ' + planType); return; }
    try {
        const response = await fetchAPI('/auth/create-checkout-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ price_id: priceId }), credentials: 'include' });
        const data = await response.json();
        if (data.checkout_url) window.location.href = data.checkout_url;
        else alert('Erro: ' + (data.error || 'Sem URL'));
    } catch (error) { console.error('❌ Erro:', error); alert('Erro: ' + error.message); }
};

async function toggleThinkingClean() {
    try {
        const response = await fetchAPI('/api/user-status', { credentials: 'include' });
        const data = await response.json();
        if (data.logged_in) {
            const hasThinkingMode = data.plan.features.includes('thinking_mode');
            if (!hasThinkingMode && !currentThinkingMode) { showUpgradePrompt(); return; }
        }
    } catch (error) { console.error('Erro ao verificar permissões:', error); }
    const newMode = !currentThinkingMode;
    console.log(' Mudando thinking mode para:', newMode ? 'ATIVADO' : 'DESATIVADO');
    try {
        const response = await fetchAPI('/thinking-mode', { method: 'POST', headers: getHeaders(), body: JSON.stringify({ enabled: newMode }), credentials: 'include' });
        const data = await response.json();
        if (data.status === 'sucesso') { currentThinkingMode = newMode; applyTheme(currentThinkingMode); updateThinkingToggleVisual(); console.log('Thinking mode atualizado:', currentThinkingMode ? 'ATIVADO' : 'DESATIVADO'); }
        else { console.error('Erro do servidor:', data); throw new Error('Falha no servidor'); }
    } catch (error) { console.error('Erro ao alterar thinking mode:', error); currentThinkingMode = newMode; applyTheme(currentThinkingMode); updateThinkingToggleVisual(); }
}

function showUpgradePrompt() {
    const modal = document.createElement('div');
    modal.className = 'upgrade-prompt-modal';
    modal.innerHTML = `<div class="upgrade-prompt-content"><div class="upgrade-prompt-header"><h3>Thinking Mode Premium</h3><button onclick="this.closest('.upgrade-prompt-modal').remove()" class="close-btn">×</button></div><div class="upgrade-prompt-body"><p>O <strong>Thinking Mode</strong> permite que o Titan pense por mais tempo em problemas complexos, oferecendo respostas mais elaboradas e detalhadas.</p><div class="feature-comparison"><div class="plan-column current"><h4>Seu Plano Atual</h4><div class="plan-features"><div class="feature">10 mensagens/hora</div><div class="feature">50 mensagens/dia</div><div class="feature disabled">❌ Thinking Mode</div></div></div><div class="plan-column premium"><h4>Plano Premium</h4><div class="plan-features"><div class="feature">1000 mensagens/hora</div><div class="feature">5000 mensagens/dia</div><div class="feature">Thinking Mode Ilimitado</div></div></div></div></div><div class="upgrade-prompt-footer"><button onclick="this.closest('.upgrade-prompt-modal').remove()" class="btn-secondary">Talvez Depois</button><button onclick="showUpgradeModal()" class="btn-primary">Ver Planos 🚀</button></div></div>`;
    document.body.appendChild(modal);
}

// =================== TOAST NOTIFICATIONS ===================
function showToast(message, type = 'info') {
    let toast = document.getElementById('toast');
    if (!toast) { toast = document.createElement('div'); toast.id = 'toast'; toast.className = 'toast'; document.body.appendChild(toast); }
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// =================== FEEDBACK SYSTEM ===================
function initializeFeedbackSystem() {
    console.log(' Sistema de feedback inicializado');
}

function checkForFeedback() {
    if (userMessageCount >= 5 && !feedbackShown) { feedbackShown = true; console.log(' Momento para feedback chegou'); }
}

// =================== EVENTOS DE PÁGINA ===================
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(() => { const particles = document.getElementById('particles'); if (particles && particles.children.length === 0) createParticles(); }, 500);
});

window.addEventListener('beforeunload', (e) => {
    if (currentRequest) { console.log('🚪 Cancelando request antes de sair da página...'); cancelCurrentRequest(); }
    if (isGenerating && currentRequest) { e.preventDefault(); e.returnValue = 'Há uma geração em andamento. Tem certeza que deseja sair?'; return e.returnValue; }
    if (sessionId) navigator.sendBeacon('/end-session', JSON.stringify({ session_id: sessionId, timestamp: new Date().toISOString() }));
});

function debugSessionInfo() {
    console.log(' DEBUG Sessão:', { sessionId: sessionId ? sessionId.substring(0, 8) + '...' : 'null', isInChatMode: isInChatMode, conversationHistory: conversationHistory.length, csrfToken: csrfToken ? 'presente' : 'ausente', currentThinkingMode: currentThinkingMode });
}

// =================== DEBUG FUNCTION ===================
function debugConnection() {
    console.log(' === DEBUG CONEXÃO ===');
    console.log('Estado atual:', { currentRequest: !!currentRequest, isGenerating: isGenerating, sessionId: sessionId, currentThinkingMode: currentThinkingMode });
    const testController = new AbortController();
    const startTime = Date.now();
    fetchAPI('/status', { signal: testController.signal }).then(response => { console.log('Conexão OK -', Date.now() - startTime, 'ms'); return response.json(); }).then(data => console.log('📊 Status do servidor:', data)).catch(error => console.log('Erro de conexão:', error));
    console.log(' Testando stream...');
    fetchAPI('/chat-stream', { method: 'POST', headers: getHeaders(), body: JSON.stringify({ mensagem: 'teste rápido', thinking_mode: false }) }).then(response => console.log('📡 Stream response:', response.status, response.headers.get('content-type'))).catch(error => console.log('Erro no stream test:', error));
}

window.debugConnection = debugConnection;

// =================== MENU LATERAL CLAUDE ===================
let sidebarOpen = false;
let currentChatId = null;
let recentChats = [];

function toggleClaudeSidebar() {
    sidebarOpen = !sidebarOpen;
    if (sidebarOpen) openClaudeSidebar();
    else closeClaudeSidebar();
}

function openClaudeSidebar() {
    const sidebar = document.getElementById('claudeSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    if (sidebar && overlay && hamburgerBtn) { sidebar.classList.add('open'); overlay.classList.add('active'); hamburgerBtn.classList.add('hidden'); sidebarOpen = true; loadRecentChats(); }
}

function closeClaudeSidebar() {
    const sidebar = document.getElementById('claudeSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    if (sidebar && overlay && hamburgerBtn) { sidebar.classList.remove('open'); overlay.classList.remove('active'); hamburgerBtn.classList.remove('hidden'); sidebarOpen = false; }
}

function loadRecentChats() {
    const recentsList = document.getElementById('recentsList');
    if (!recentsList) return;
    if (recentChats.length === 0) recentsList.innerHTML = `<div class="recent-item" style="color: #666; text-align: center; padding: 20px; cursor: default;">Nenhuma conversa ainda<br><small>Inicie uma conversa para ver o histórico</small></div>`;
    else recentsList.innerHTML = recentChats.map(chat => `<div class="recent-item ${chat.id === currentChatId ? 'current-chat' : ''}" onclick="loadChatFromSidebar('${chat.id}')">${escapeHtml(chat.title)}</div>`).join('');
}

function updateThinkingStatusInSidebar() {
    const thinkingStatus = document.getElementById('thinkingStatus');
    if (thinkingStatus) thinkingStatus.textContent = currentThinkingMode ? 'Ativado' : 'Desativado';
}

function addChatToRecents(chatTitle, chatId) {
    recentChats = recentChats.filter(chat => chat.id !== chatId);
    recentChats.unshift({ id: chatId || generateChatId(), title: chatTitle, timestamp: new Date().toISOString() });
    if (recentChats.length > 15) recentChats = recentChats.slice(0, 15);
    if (sidebarOpen) loadRecentChats();
}

function loadChatFromSidebar(chatId) {
    currentChatId = chatId;
    loadRecentChats();
    closeClaudeSidebar();
    console.log('Carregando chat:', chatId);
}

function showTitanInfo() {
    const modal = document.getElementById('titanInfoModal');
    const modeIcon = document.getElementById('modeIcon');
    const modeText = document.getElementById('modeText');
    modeIcon.textContent = currentThinkingMode ? '' : '⚡';
    modeText.textContent = currentThinkingMode ? 'Raciocínio Profundo' : 'Resposta Direta';
    modal.style.display = 'flex';
    closeClaudeSidebar();
}

function closeTitanInfo() {
    const modal = document.getElementById('titanInfoModal');
    modal.style.display = 'none';
}

function generateChatId() {
    return 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

function generateChatTitle(message) {
    if (!message) return "Nova conversa";
    let title = message.substring(0, 40);
    if (message.length > 40) title += "...";
    title = title.replace(/[^\w\s\-\.\,\!\?]/g, '');
    return title || "Nova conversa";
}

// =================== DROPDOWN DE CONFIGURAÇÕES ===================
let configDropdownOpen = false;

function toggleConfigDropdown() {
    const dropdown = document.getElementById('dropdownContent');
    if (!dropdown) { console.error('Dropdown não encontrado!'); return; }
    configDropdownOpen = !configDropdownOpen;
    if (configDropdownOpen) { dropdown.classList.add('show'); updateDropdownThinkingToggle(); }
    else dropdown.classList.remove('show');
}

function toggleConfigDropdownChat() {
    const dropdown = document.getElementById('dropdownContentChat');
    if (!dropdown) { console.error('Dropdown chat não encontrado!'); return; }
    if (dropdown.classList.contains('show')) dropdown.classList.remove('show');
    else { dropdown.classList.add('show'); updateDropdownThinkingToggleChat(); }
}

function closeConfigDropdown() {
    const dropdown = document.getElementById('dropdownContent');
    if (dropdown) dropdown.classList.remove('show');
    configDropdownOpen = false;
}

function closeConfigDropdownChat() {
    const dropdown = document.getElementById('dropdownContentChat');
    if (dropdown) dropdown.classList.remove('show');
}

function updateDropdownThinkingToggle() {
    const toggle = document.getElementById('dropdownThinkingToggle');
    if (toggle) currentThinkingMode ? toggle.classList.add('active') : toggle.classList.remove('active');
}

function updateDropdownThinkingToggleChat() {
    const toggle = document.getElementById('dropdownThinkingToggleChat');
    if (toggle) currentThinkingMode ? toggle.classList.add('active') : toggle.classList.remove('active');
}

async function toggleThinkingFromDropdown() {
    await toggleThinkingClean();
    updateDropdownThinkingToggle();
    updateDropdownThinkingToggleChat();
}

document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('configDropdown');
    const dropdownChat = document.getElementById('configDropdownChat');
    if (dropdown && !dropdown.contains(e.target)) closeConfigDropdown();
    if (dropdownChat && !dropdownChat.contains(e.target)) closeConfigDropdownChat();
});

function setupThinkingModeClickOutside() {
    console.log(' Setup thinking mode click outside configurado');
}

// =================== SISTEMA DE AÇÕES DAS MENSAGENS ===================
function addMessageActions(messageContainer, content, isUser = false) {
    if (isUser) return;
    const assistantDiv = messageContainer.querySelector('.assistant-message');
    if (!assistantDiv || assistantDiv.querySelector('.message-actions')) return;
    const template = document.getElementById('message-actions-template');
    if (!template) { console.error('Template de ações não encontrado!'); return; }
    const actionsClone = template.content.cloneNode(true);
    const actionsContainer = actionsClone.querySelector('.message-actions');
    actionsContainer.setAttribute('data-content', content);
    const regenerateBtn = actionsClone.querySelector('.regenerate-btn');
    const likeBtn = actionsClone.querySelector('.like-btn');
    const dislikeBtn = actionsClone.querySelector('.dislike-btn');
    const copyBtn = actionsClone.querySelector('.copy-btn');
    regenerateBtn.addEventListener('click', () => regenerateMessage(regenerateBtn));
    likeBtn.addEventListener('click', () => likeMessage(likeBtn));
    dislikeBtn.addEventListener('click', () => dislikeMessage(dislikeBtn));
    copyBtn.addEventListener('click', () => copyMessage(copyBtn));
    assistantDiv.appendChild(actionsClone);
    console.log('Ações adicionadas à mensagem');
}

async function regenerateMessage(button) {
    console.log(' Regenerando mensagem...');
    button.classList.add('animate');
    setTimeout(() => button.classList.remove('animate'), 300);
    const messageContainer = button.closest('.message');
    const messagesContainer = document.getElementById('chatMessages');
    const messages = Array.from(messagesContainer.querySelectorAll('.message'));
    const currentIndex = messages.indexOf(messageContainer);
    let userMessage = null;
    for (let i = currentIndex - 1; i >= 0; i--) if (messages[i].classList.contains('user')) { const userContent = messages[i].querySelector('.message-content'); if (userContent) { userMessage = userContent.textContent.trim(); break; } }
    if (!userMessage) { showToast('Não foi possível encontrar a mensagem anterior', 'error'); return; }
    const finalMessage = addThinkingCommand(userMessage);
    messageContainer.remove();
    await sendMessageToServer(finalMessage);
}

function likeMessage(button) {
    console.log('👍 Mensagem curtida');
    button.classList.add('animate', 'liked');
    setTimeout(() => button.classList.remove('animate'), 300);
    const actionsContainer = button.closest('.message-actions');
    const dislikeBtn = actionsContainer.querySelector('.dislike-btn');
    if (dislikeBtn) dislikeBtn.classList.remove('disliked');
    const textSpan = button.querySelector('.action-btn-text');
    const originalText = textSpan.textContent;
    textSpan.textContent = 'Obrigado!';
    setTimeout(() => textSpan.textContent = originalText, 2000);
    sendFeedbackToServer('like', button);
}

function dislikeMessage(button) {
    console.log('👎 Mensagem não curtida');
    button.classList.add('animate', 'disliked');
    setTimeout(() => button.classList.remove('animate'), 300);
    const actionsContainer = button.closest('.message-actions');
    const likeBtn = actionsContainer.querySelector('.like-btn');
    if (likeBtn) likeBtn.classList.remove('liked');
    const textSpan = button.querySelector('.action-btn-text');
    const originalText = textSpan.textContent;
    textSpan.textContent = 'Anotado';
    setTimeout(() => textSpan.textContent = originalText, 2000);
    sendFeedbackToServer('dislike', button);
}

async function copyMessage(button) {
    try {
        const messageContainer = button.closest('.message');
        if (!messageContainer) return;
        let textToCopy = '';
        const messageContent = messageContainer.querySelector('.message-content');
        if (messageContent) textToCopy = messageContent.innerText || messageContent.textContent || '';
        if (!textToCopy) { const streamingContent = messageContainer.querySelector('.streaming-content'); if (streamingContent) textToCopy = streamingContent.innerText || streamingContent.textContent || ''; }
        if (!textToCopy) { const assistantMessage = messageContainer.querySelector('.assistant-message'); if (assistantMessage) { const clone = assistantMessage.cloneNode(true); const thinkingContainer = clone.querySelector('.thinking-container'); const messageActions = clone.querySelector('.message-actions'); if (thinkingContainer) thinkingContainer.remove(); if (messageActions) messageActions.remove(); textToCopy = clone.innerText || clone.textContent || ''; } }
        if (!textToCopy || textToCopy.trim().length === 0) return;
        textToCopy = textToCopy.trim();
        let copiouSucesso = false;
        if (navigator.clipboard && navigator.clipboard.writeText) { try { await navigator.clipboard.writeText(textToCopy); copiouSucesso = true; } catch (clipboardError) {} }
        if (!copiouSucesso) { try { const textarea = document.createElement('textarea'); textarea.value = textToCopy; textarea.style.position = 'fixed'; textarea.style.left = '-9999px'; textarea.style.top = '-9999px'; document.body.appendChild(textarea); textarea.focus(); textarea.select(); const copiado = document.execCommand('copy'); document.body.removeChild(textarea); if (copiado) copiouSucesso = true; } catch (execError) {} }
        if (copiouSucesso) {
            button.classList.add('animate', 'copied');
            setTimeout(() => button.classList.remove('animate'), 300);
            const textSpan = button.querySelector('.action-btn-text');
            if (textSpan) { const originalText = textSpan.textContent; textSpan.textContent = 'Copiado!'; setTimeout(() => { textSpan.textContent = originalText; button.classList.remove('copied'); }, 1500); }
        }
    } catch (error) { console.error('Erro silencioso:', error); }
}

async function sendFeedbackToServer(type, button) {
    try {
        const actionsContainer = button.closest('.message-actions');
        const content = actionsContainer.getAttribute('data-content');
        const response = await fetchAPI('/feedback', { method: 'POST', headers: getHeaders(), body: JSON.stringify({ type: type, content: content, session_id: sessionId, timestamp: new Date().toISOString() }) });
        if (response.ok) console.log(`Feedback ${type} enviado com sucesso`);
    } catch (error) { console.warn('Erro ao enviar feedback:', error); }
}

// =================== OUTRAS FUNÇÕES ===================
function setQuickExample(example) {
    if (!mainInput) return;
    const safeExample = escapeHtml(example);
    mainInput.value = safeExample;
    mainInput.focus();
    const container = mainInput.closest('.main-input-container');
    if (container) { container.style.borderColor = '#f59e0b'; container.style.boxShadow = '0 0 0 3px rgba(245, 158, 11, 0.15)'; setTimeout(() => { container.style.borderColor = ''; container.style.boxShadow = ''; }, 1500); }
}

function showKeyboardShortcuts() {
    const modal = document.getElementById('shortcutsModal');
    if (modal) modal.style.display = 'flex';
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';
}

function startNewChat() {
    console.log('Nova conversa - RESET COMPLETO');
    if (currentRequest) cancelCurrentRequest();
    clearCurrentSession();
    userMessageCount = 0;
    feedbackShown = false;
    const messagesContainer = document.getElementById('chatMessages');
    if (messagesContainer) messagesContainer.innerHTML = '';
    const chatInputArea = document.getElementById('chatInputArea');
    if (chatInputArea) chatInputArea.style.display = 'none';
    isInChatMode = false;
    if (chatContainer) { chatContainer.style.display = 'none'; chatContainer.style.opacity = '0'; chatContainer.classList.remove('active'); }
    if (welcomeContainer) { welcomeContainer.style.display = 'flex'; welcomeContainer.style.opacity = '1'; welcomeContainer.style.transform = 'scale(1)'; welcomeContainer.classList.remove('hidden'); }
    if (mainInput) { mainInput.value = ''; setTimeout(() => mainInput.focus(), 100); }
    console.log('Reset completo para welcome');
}

function focusCurrentInput() {
    const chatInput = document.getElementById('chatInput');
    const mainInput = document.getElementById('mainInput');
    if (isInChatMode && chatInput && chatInput.offsetParent !== null) chatInput.focus();
    else if (mainInput) mainInput.focus();
}

function refreshMessages() {
    const messagesContainer = document.getElementById('chatMessages');
    if (!messagesContainer) { console.log(' Container de mensagens não encontrado'); return; }
    const assistantMessages = messagesContainer.querySelectorAll('.assistant-message');
    if (assistantMessages.length === 0) { console.log(' Nenhuma mensagem do assistente para atualizar'); return; }
    assistantMessages.forEach((msg, index) => {
        const mode = currentThinkingMode ? 'Raciocínio' : 'Direto';
        const safeMode = sanitizeAttribute(mode);
        msg.setAttribute('data-mode', safeMode);
        const thinkingContainer = msg.querySelector('.thinking-container');
        if (thinkingContainer) currentThinkingMode ? thinkingContainer.style.opacity = '1' : thinkingContainer.style.opacity = '0.7';
    });
    console.log(`${assistantMessages.length} mensagens atualizadas para modo: ${currentThinkingMode ? 'Raciocínio' : 'Direto'}`);
}

// =================== GESTÃO DE SESSÃO ===================
function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function startNewSession() {
    sessionId = generateSessionId();
    conversationHistory = [];
    isNewSession = true;
    userMessageCount = 0;
    feedbackShown = false;
    console.log('Nova sessão iniciada:', sessionId);
}

function clearCurrentSession() {
    if (currentRequest) cancelCurrentRequest();
    sessionId = null;
    conversationHistory = [];
    isNewSession = true;
    userMessageCount = 0;
    feedbackShown = false;
    console.log('🧹 Sessão limpa');
}

// =================== EXPORTAR FUNÇÕES GLOBAIS ===================
window.toggleConfigDropdown = toggleConfigDropdown;
window.closeConfigDropdown = closeConfigDropdown;
window.toggleThinkingFromDropdown = toggleThinkingFromDropdown;
window.setQuickExample = setQuickExample;
window.toggleSettingsTab = toggleSettingsTab;
window.toggleThinkingClean = toggleThinkingClean;
window.showKeyboardShortcuts = showKeyboardShortcuts;
window.closeModal = closeModal;
window.startNewChat = startNewChat;
window.backToWelcome = backToWelcome;
window.toggleThinking = toggleThinking;
window.cancelCurrentRequest = cancelCurrentRequest;
window.toggleClaudeSidebar = toggleClaudeSidebar;
window.openClaudeSidebar = openClaudeSidebar;
window.closeClaudeSidebar = closeClaudeSidebar;
window.showTitanInfo = showTitanInfo;
window.closeTitanInfo = closeTitanInfo;
window.closeConfigDropdownChat = closeConfigDropdownChat;
window.toggleConfigDropdownChat = toggleConfigDropdownChat;
window.regenerateMessage = regenerateMessage;
window.likeMessage = likeMessage;
window.dislikeMessage = dislikeMessage;
window.copyMessage = copyMessage;
window.addMessageActions = addMessageActions;
window.openProModal = openProModal;
window.closeProModal = closeProModal;
window.selectPlan = selectPlan;

console.log('Sistema de ações das mensagens ATIVO!');
console.log('Titan Chat - Sistema com STREAMING REAL carregado!');

// =================== FUNÇÃO AJAX FETCH ===================
async function fetchAPI(url, options = {}) {
    const defaultOptions = { credentials: 'include', ...options };
    try { const response = await fetch(url, defaultOptions); if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`); return response; }
    catch (error) { console.error('Erro na requisição:', error); throw error; }
}