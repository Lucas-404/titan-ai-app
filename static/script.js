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

// Variáveis de sessão - globais para acesso do history.js
window.sessionId = null;
window.conversationHistory = [];
window.isNewSession = true;

// Funções helper para sincronizar variáveis
function setSessionId(id) {
    window.sessionId = id;
    sessionId = id;
}

function addToConversationHistory(message) {
    window.conversationHistory.push(message);
    conversationHistory = window.conversationHistory;
}

function clearConversationHistory() {
    window.conversationHistory = [];
    conversationHistory = window.conversationHistory;
}

function setConversationHistory(history) {
    window.conversationHistory = history || [];
    conversationHistory = window.conversationHistory;
}

// Aliases locais para compatibilidade
let sessionId = window.sessionId;
let conversationHistory = window.conversationHistory;
let isNewSession = window.isNewSession;

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
        
        // 🆕 EMERGENCY: Configurar auto-save de emergência
        setupEmergencyAutoSave();
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
    setupHistorySidebarListeners(); // 🆕 Configurar sidebar
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

// 🆕 CONFIGURAR SIDEBAR DE HISTÓRICO
function setupHistorySidebarListeners() {
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            console.log('🔘 Botão sidebar clicado');
            if (window.toggleHistorySidebar && typeof window.toggleHistorySidebar === 'function') {
                window.toggleHistorySidebar();
            } else {
                console.warn('⚠️ Função toggleHistorySidebar não disponível - history.js pode não ter carregado');
            }
        });
        console.log('✅ Sidebar toggle configurado');
    } else {
        console.warn('⚠️ Botão sidebarToggle não encontrado no DOM');
    }
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
    
    // 🆕 SALVAMENTO ANTECIPADO: Garantir sessão válida antes
    if (!sessionId || !window.sessionId) {
        console.log('🔄 Sessão não encontrada - inicializando...');
        const sessionInitialized = await initializeUserSession();
        if (!sessionInitialized) {
            console.error('❌ Falha crítica na inicialização da sessão');
            showToast('Erro de sessão. Tente recarregar a página.', 'error');
            return;
        }
    }
    
    // 1. Adicionar mensagem do usuário ao histórico
    addToConversationHistory({
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
    });
    
    // 2. Criar e salvar chat imediatamente
    await createChatEarly(message);
    
    if (!isInChatMode) {
        transitionToChat();
        setTimeout(() => { 
            addMessageToChatVisual(message, true); 
            sendMessageToServer(finalMessage); 
        }, 350);
    } else {
        addMessageToChatVisual(message, true);
        await sendMessageToServer(finalMessage);
    }
    mainInput.value = '';
    mainInput.style.height = 'auto';
}

async function sendMessageToServer(message) {
    if (!validateInput(message)) return;
    
    // Garantir sessão válida antes de enviar
    if (!sessionId || !window.sessionId) {
        console.log('🔄 Sessão não encontrada - inicializando antes do envio...');
        const sessionInitialized = await initializeUserSession();
        if (!sessionInitialized) {
            console.error('❌ Falha na inicialização da sessão para envio');
            showError('Erro de sessão. Tente recarregar a página.');
            return;
        }
    }
    
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
            showError(errorData.error || 'Muitas requisições. Tente novamente em alguns minutos.');
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






async function sendChatMessage() {
    if (isGenerating && currentRequest) { cancelCurrentRequest(); return; }
    const chatInput = document.getElementById('chatInput');
    const message = chatInput?.value?.trim();
    if (!message) return;
    const finalMessage = addThinkingCommand(message);
    console.log('📤 Enviando do chat:', finalMessage);
    
    // 🆕 SALVAMENTO ANTECIPADO: Garantir sessão válida antes
    if (!sessionId || !window.sessionId) {
        console.log('🔄 Sessão não encontrada - inicializando...');
        const sessionInitialized = await initializeUserSession();
        if (!sessionInitialized) {
            console.error('❌ Falha crítica na inicialização da sessão');
            showToast('Erro de sessão. Tente recarregar a página.', 'error');
            return;
        }
    }
    
    // 1. Adicionar mensagem do usuário ao histórico
    addToConversationHistory({
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
    });
    
    // 2. Criar e salvar chat imediatamente
    await createChatEarly(message);
    
    // 3. Adicionar mensagem ao chat visual (sem adicionar ao histórico novamente)
    addMessageToChatVisual(message, true);
    
    chatInput.value = '';
    chatInput.style.height = 'auto';
    await sendMessageToServer(finalMessage);
}

async function processStreamResponse(response, container) {
    console.log(' [STREAM] Processando resposta...');
    
    // 🆕 SYNC: Garantir que session_id esteja sincronizado
    await ensureSessionSync();
    
    const reader = response.body.getReader();
    let fullContent = '';
    let thinkingContent = '';
    let chunks = 0;
    let streamCompleted = false;
    
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
                    if (data.type === 'error') { showError(data.error); streamContainer.remove(); return; }
                    if (data.type === 'done') { 
                        console.log('🏁 [STREAM] Done recebido'); 
                        finalizeStreamingMessage(container, fullContent, thinkingContent);
                        streamCompleted = true;
                        break; // Sair do loop for
                    }
                } catch (e) { console.warn(' [STREAM] Erro no parse:', e); }
            }
        }
        
        // Se recebemos 'done', sair do loop while também
        if (streamCompleted) {
            break;
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
        if (currentThinkingMode && !container.querySelector('.thinking-bar')) { thinkingContainer = createThinkingContainerLive(container); thinkingScrollElement = thinkingContainer?.querySelector('.thinking-bar-scroll'); console.log(' Container de thinking criado em tempo real'); }
        if (thinkEndIndex !== -1) { thinkingContent = fullContent.substring(thinkStartIndex + 7, thinkEndIndex); afterThinkingContent = fullContent.substring(thinkEndIndex + 8).trim(); insideThinking = false; console.log('Thinking completo extraído:', thinkingContent.length, 'chars'); }
        else { thinkingContent = fullContent.substring(thinkStartIndex + 7); afterThinkingContent = ''; insideThinking = true; }
        if (!thinkingContainer) thinkingContainer = container.querySelector('.thinking-bar');
        if (!thinkingScrollElement) thinkingScrollElement = thinkingContainer?.querySelector('.thinking-bar-scroll');
    } else { afterThinkingContent = fullContent; insideThinking = false; }
    return { insideThinking, thinkingContent, afterThinkingContent, thinkingContainer, thinkingScrollElement };
}

// CRIAR CONTAINER DE THINKING USANDO TEMPLATE
function createThinkingContainerLive(messageContainer) {
    const assistantDiv = messageContainer.querySelector('.assistant-message');
    if (!assistantDiv) return null;
    
    const template = document.getElementById('thinking-bar-template');
    if (!template) {
        console.error('Template de thinking bar não encontrado!');
        return null;
    }
    
    const thinkingClone = template.content.cloneNode(true);
    const thinkingContainer = thinkingClone.querySelector('.thinking-bar');
    const summarySpan = thinkingClone.querySelector('.thinking-bar-text');
    
    // Manter texto padrão "Pensando..."
    summarySpan.textContent = '🧠 Pensando...';
    
    assistantDiv.insertAdjacentElement('afterbegin', thinkingContainer);
    console.log(' Container de thinking live criado usando template');
    return thinkingContainer;
}

// SCROLL INSTANTÂNEO
function scrollToBottom() {
    const messagesContainer = document.getElementById('chatMessages');
    if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// NOVA FUNÇÃO: Atualizar thinking em tempo real com crescimento dinâmico
function updateThinkingContent(thinkingContainer, content) {
    if (!thinkingContainer) return;
    const scroll = thinkingContainer.querySelector('.thinking-bar-scroll');
    if (scroll) { 
        scroll.textContent = content; 
        scroll.scrollTop = scroll.scrollHeight;
        
        // Conteúdo disponível - manter simples
    }
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
        
        // Usar template para criar container de thinking
        const template = document.getElementById('thinking-bar-template');
        if (template) {
            const thinkingClone = template.content.cloneNode(true);
            const thinkingScroll = thinkingClone.querySelector('.thinking-bar-scroll');
            thinkingScroll.textContent = thinking;
            
            assistantDiv.innerHTML = '';
            assistantDiv.appendChild(thinkingClone);
            
            const messageContentDiv = document.createElement('div');
            messageContentDiv.className = 'message-content';
            messageContentDiv.innerHTML = formatMessage(cleanContent);
            assistantDiv.appendChild(messageContentDiv);
        } else {
            // Fallback caso template não exista
            assistantDiv.innerHTML = `<div class="message-content">${formatMessage(cleanContent)}</div>`;
        }
        console.log(' Thinking adicionado à mensagem!');
        
        // Adicionar mensagem da IA ao histórico (caso com thinking)
        const assistantMessage = {
            role: 'assistant',
            content: cleanContent,
            thinking: thinking,
            timestamp: new Date().toISOString()
        };
        addToConversationHistory(assistantMessage);
        console.log('🧠 Mensagem da IA com thinking adicionada ao histórico');
        
    } else {
        const contentDiv = container.querySelector('.streaming-content');
        if (contentDiv) { 
            const cleanContent = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim(); 
            contentDiv.innerHTML = formatMessage(cleanContent); 
            contentDiv.classList.remove('streaming-content'); 
        }
        
        // Adicionar mensagem da IA ao histórico (caso sem thinking)
        const finalContent = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        const assistantMessage = {
            role: 'assistant',
            content: finalContent,
            timestamp: new Date().toISOString()
        };
        addToConversationHistory(assistantMessage);
        console.log('⚡ Mensagem da IA sem thinking adicionada ao histórico');
    }
    
    console.log('🏁 STREAMING FINALIZADO - Backend salvou automaticamente');
    console.log('📊 Estado final:');
    console.log('   - window.sessionId:', window.sessionId);
    console.log('   - window.conversationHistory.length:', window.conversationHistory?.length);
    console.log('   - Última mensagem:', window.conversationHistory?.[window.conversationHistory?.length - 1]);
    
    // 🆕 RECARREGAR HISTÓRICO APÓS BACKEND SALVAR
    setTimeout(async () => {
        console.log('🔄 Recarregando histórico após mensagem...');
        if (window.loadChatHistoryFromStorage && typeof window.loadChatHistoryFromStorage === 'function') {
            try {
                await window.loadChatHistoryFromStorage();
                console.log('✅ Histórico recarregado - chat deve aparecer na sidebar');
            } catch (error) {
                console.error('❌ Erro ao recarregar histórico:', error);
            }
        } else {
            console.warn('⚠️ Função loadChatHistoryFromStorage não disponível');
        }
    }, 2000); // 2s para garantir que backend salvou
    
    // 🆕 AUTO-SAVE: Disparar salvamento automático após finalizar streaming
    setTimeout(() => {
        console.log('🔍 === AUTO-SAVE DEBUG INICIADO ===');
        console.log('SessionID atual:', window.sessionId);
        console.log('ConversationHistory length:', window.conversationHistory?.length);
        console.log('ConversationHistory:', window.conversationHistory);
        console.log('Função autoSaveChatDuringConversation disponível:', typeof window.autoSaveChatDuringConversation);
        console.log('History.js carregado:', typeof window.loadChatHistoryFromStorage);
        
        if (window.autoSaveChatDuringConversation && typeof window.autoSaveChatDuringConversation === 'function') {
            console.log('💾 EXECUTANDO auto-save externo...');
            try {
                window.autoSaveChatDuringConversation();
                console.log('✅ Auto-save externo chamado com sucesso');
            } catch (error) {
                console.error('❌ ERRO no auto-save externo:', error);
            }
        } else {
            console.log('⚠️ Função auto-save externa NÃO DISPONÍVEL');
            console.log('💾 Tentando auto-save fallback integrado...');
            
            // FALLBACK: Auto-save integrado
            if (window.sessionId && window.conversationHistory && window.conversationHistory.length > 0) {
                console.log('✅ Dados OK - executando fallback...');
                autoSaveFallback();
            } else {
                console.log('❌ Dados insuficientes para auto-save:');
                console.log('- SessionID:', !!window.sessionId);
                console.log('- ConversationHistory:', !!window.conversationHistory);
                console.log('- Length:', window.conversationHistory ? window.conversationHistory.length : 0);
            }
        }
        console.log('🔍 === FIM AUTO-SAVE DEBUG ===');
    }, 1000); // 1s delay para garantir que tudo foi processado
    
    setTimeout(() => addMessageActions(container, content, false), 100);
    scrollToBottom();
}

// 🆕 SYNC: Garantir sincronização de session_id
async function ensureSessionSync() {
    try {
        // Verificar se já temos session_id local
        if (window.sessionId) {
            console.log('📋 Session ID já definido:', window.sessionId.substring(0, 8) + '...');
            return;
        }
        
        // Tentar obter session_id do servidor
        const response = await fetchAPI('/debug-session', {
            method: 'GET',
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.flask_session_id) {
                console.log('🔄 Sincronizando session_id do servidor:', data.flask_session_id.substring(0, 8) + '...');
                window.setSessionId(data.flask_session_id);
            }
        }
    } catch (error) {
        console.warn('⚠️ Erro na sincronização de sessão:', error);
    }
}

// 🆕 EMERGENCY: Auto-save de emergência com timing conservador
function setupEmergencyAutoSave() {
    console.log('🚨 Configurando auto-save de emergência com validação...');
    
    // PRIMEIRO CHECK: Após 60s (tempo maior para garantir inicialização)
    setTimeout(async () => {
        console.log('🚨 EMERGENCY CHECK 1: Verificando primeira conversa...');
        
        // Só fazer emergency auto-save se a sessão estiver validada
        if (window.sessionId && window.conversationHistory?.length > 0 && !window.lastAutoSave) {
            console.log('🚨 EMERGENCY AUTO-SAVE: Primeira conversa detectada');
            
            if (window.autoSaveChatDuringConversation && typeof window.autoSaveChatDuringConversation === 'function') {
                try {
                    await window.autoSaveChatDuringConversation();
                } catch (error) {
                    console.error('❌ Erro no emergency auto-save:', error);
                }
            }
        } else {
            console.log('⏳ Emergency check 1: Sessão ainda não pronta ou sem conversa');
        }
    }, 60000); // 60s - mais conservador
    
    // SEGUNDO CHECK: Após 2 minutos (backup do backup)
    setTimeout(async () => {
        console.log('🚨 EMERGENCY CHECK 2: Segundo check de segurança...');
        
        if (window.sessionId && window.conversationHistory?.length > 0 && !window.lastAutoSave) {
            console.log('🚨 EMERGENCY AUTO-SAVE FINAL: Última tentativa');
            
            if (window.autoSaveChatDuringConversation && typeof window.autoSaveChatDuringConversation === 'function') {
                try {
                    await window.autoSaveChatDuringConversation();
                } catch (error) {
                    console.error('❌ Erro no emergency auto-save final:', error);
                }
            }
        }
    }, 120000); // 2 minutos
    
    // Auto-save periódico mais conservador para conversas não salvas
    setInterval(async () => {
        const now = Date.now();
        const lastSave = window.lastAutoSave || 0;
        
        // Só executar se sessão estiver válida E passou tempo suficiente
        if (window.sessionId && window.conversationHistory?.length > 0 && (now - lastSave) > 120000) { // 2 min
            console.log('⏰ Auto-save periódico conservador...');
            
            if (window.autoSaveChatDuringConversation && typeof window.autoSaveChatDuringConversation === 'function') {
                try {
                    await window.autoSaveChatDuringConversation();
                } catch (error) {
                    console.error('❌ Erro no auto-save periódico:', error);
                }
            }
        }
    }, 45000); // Check a cada 45s
    
    console.log('✅ Emergency auto-save configurado');
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
// Nova função que só adiciona ao visual, sem histórico
function addMessageToChatVisual(content, isUser, systemInfo = null) {
    const messagesContainer = document.getElementById('chatMessages');
    if (!messagesContainer) { console.error('Elemento #chatMessages não encontrado no DOM!'); return; }
    
    console.log('🎨 Adicionando mensagem ao chat visual:', isUser ? 'usuário' : 'assistente');
    _addMessageToChatDOM(messagesContainer, content, isUser, systemInfo);
}

function addMessageToChat(content, isUser, systemInfo = null) {
    const messagesContainer = document.getElementById('chatMessages');
    if (!messagesContainer) { console.error('Elemento #chatMessages não encontrado no DOM!'); return; }
    
    // Adicionar ao histórico de conversa
    if (isUser) {
        addToConversationHistory({
            role: 'user',
            content: content,
            timestamp: new Date().toISOString()
        });
        console.log('📝 Mensagem do usuário adicionada ao histórico');
    }
    
    _addMessageToChatDOM(messagesContainer, content, isUser, systemInfo);
}

// Função helper para adicionar ao DOM
function _addMessageToChatDOM(messagesContainer, content, isUser, systemInfo) {
    
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
            // Usar template para criar assistant message com thinking
            const template = document.getElementById('thinking-bar-template');
            if (template) {
                const thinkingClone = template.content.cloneNode(true);
                const summarySpan = thinkingClone.querySelector('.thinking-bar-text');
                const thinkingScroll = thinkingClone.querySelector('.thinking-bar-scroll');
                
                summarySpan.textContent = `Pensou por ${safeTempoResposta}`;
                thinkingScroll.textContent = pensamento;
                
                const assistantDiv = document.createElement('div');
                assistantDiv.className = 'assistant-message message-block';
                assistantDiv.setAttribute('data-mode', safeMode);
                
                assistantDiv.appendChild(thinkingClone);
                
                const messageContentDiv = document.createElement('div');
                messageContentDiv.className = 'message-content';
                messageContentDiv.innerHTML = safeContent;
                assistantDiv.appendChild(messageContentDiv);
                
                messageContent = assistantDiv.outerHTML;
            } else {
                // Fallback
                messageContent = `<div class="assistant-message" data-mode="${safeMode}"><div class="message-content">${safeContent}</div></div>`;
            }
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

function toggleThinkingBar(bar) {
    const content = bar.querySelector('.thinking-bar-content');
    const icon = bar.querySelector('.thinking-bar-icon');
    if (!content) return;
    
    if (bar.classList.contains('expanded')) {
        bar.classList.remove('expanded');
        console.log('🧠 Thinking fechado');
    } else {
        bar.classList.add('expanded');
        console.log('🧠 Thinking aberto');
    }
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

// =================== THINKING MODE ===================
// Função simplificada - sem verificação de planos

async function initializeUserSession() {
    console.log('🔄 Inicializando sessão com validação completa...');
    
    // Máximo 3 tentativas
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            console.log(`📡 Tentativa ${attempt}/3 de inicialização...`);
            
            const response = await fetchAPI('/new-session', { 
                method: 'POST', 
                credentials: 'include',
                headers: getHeaders()
            });
            
            if (response.ok) { 
                const data = await response.json(); 
                console.log('✅ Resposta do servidor:', data); 
                
                if (data.session_id && data.status === 'sucesso') {
                    // Definir session ID
                    setSessionId(data.session_id);
                    console.log('📋 Session ID sincronizado:', data.session_id.substring(0, 8) + '...');
                    
                    // VALIDAÇÃO DUPLA: Verificar se foi definido corretamente
                    if (window.sessionId === data.session_id) {
                        console.log('✅ Sincronização confirmada - sessão pronta para uso!');
                        
                        // TESTE FINAL: Verificar se backend reconhece a sessão
                        await validateSessionWithBackend();
                        return true; // Sucesso
                    } else {
                        console.error('❌ Falha na sincronização das variáveis de sessão');
                        throw new Error('Sincronização de variáveis falhou');
                    }
                } else {
                    console.error('❌ Resposta inválida do servidor:', data);
                    throw new Error('Resposta sem session_id válido');
                }
            } else {
                console.error(`❌ Erro HTTP ${response.status}:`, await response.text());
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) { 
            console.error(`❌ Tentativa ${attempt} falhou:`, error.message);
            
            if (attempt < 3) {
                // Aguardar antes da próxima tentativa
                const delay = attempt * 1000; // 1s, 2s
                console.log(`⏳ Aguardando ${delay}ms antes da próxima tentativa...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.error('❌ Todas as tentativas falharam - usando fallback');
                // Fallback para sessão local
                startNewSession();
                return false;
            }
        }
    }
    
    return false;
}

// Nova função para validar sessão com backend
async function validateSessionWithBackend() {
    try {
        console.log('🔍 Validando sessão com o backend...');
        const response = await fetchAPI('/debug-session', { 
            method: 'GET', 
            credentials: 'include' 
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('🔍 Status da sessão no backend:', {
                flask_session_id: data.flask_session_id?.substring(0, 8) + '...',
                session_exists: data.session_exists_in_manager,
                match: data.flask_session_id === window.sessionId
            });
            
            if (data.flask_session_id !== window.sessionId) {
                console.warn('⚠️ Dessincronia detectada - corrigindo...');
                setSessionId(data.flask_session_id);
            }
        }
    } catch (error) {
        console.warn('⚠️ Não foi possível validar sessão:', error.message);
    }
}
}


function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') if (isGenerating && currentRequest) cancelCurrentRequest();
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); startNewChat(); }
        if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); showKeyboardShortcuts(); }
    });
    console.log('⌨️ Atalhos de teclado configurados');
}











async function toggleThinkingClean() {
    const newMode = !currentThinkingMode;
    console.log(' Mudando thinking mode para:', newMode ? 'ATIVADO' : 'DESATIVADO');
    try {
        const response = await fetchAPI('/thinking-mode', { method: 'POST', headers: getHeaders(), body: JSON.stringify({ enabled: newMode }), credentials: 'include' });
        const data = await response.json();
        if (data.status === 'sucesso') { currentThinkingMode = newMode; applyTheme(currentThinkingMode); updateThinkingToggleVisual(); console.log('Thinking mode atualizado:', currentThinkingMode ? 'ATIVADO' : 'DESATIVADO'); }
        else { console.error('Erro do servidor:', data); throw new Error('Falha no servidor'); }
    } catch (error) { console.error('Erro ao alterar thinking mode:', error); currentThinkingMode = newMode; applyTheme(currentThinkingMode); updateThinkingToggleVisual(); }
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

// =================== INFO DO TITAN ===================
function showTitanInfo() {
    const modal = document.getElementById('titanInfoModal');
    if (!modal) return;
    const modeIcon = document.getElementById('modeIcon');
    const modeText = document.getElementById('modeText');
    if (modeIcon) modeIcon.textContent = currentThinkingMode ? '' : '⚡';
    if (modeText) modeText.textContent = currentThinkingMode ? 'Raciocínio Profundo' : 'Resposta Direta';
    modal.style.display = 'flex';
}

function closeTitanInfo() {
    const modal = document.getElementById('titanInfoModal');
    if (modal) modal.style.display = 'none';
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
        if (!textToCopy) { const assistantMessage = messageContainer.querySelector('.assistant-message'); if (assistantMessage) { const clone = assistantMessage.cloneNode(true); const thinkingContainer = clone.querySelector('.thinking-bar'); const messageActions = clone.querySelector('.message-actions'); if (thinkingContainer) thinkingContainer.remove(); if (messageActions) messageActions.remove(); textToCopy = clone.innerText || clone.textContent || ''; } }
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
        const thinkingContainer = msg.querySelector('.thinking-bar');
        if (thinkingContainer) currentThinkingMode ? thinkingContainer.style.opacity = '1' : thinkingContainer.style.opacity = '0.7';
    });
    console.log(`${assistantMessages.length} mensagens atualizadas para modo: ${currentThinkingMode ? 'Raciocínio' : 'Direto'}`);
}

// =================== GESTÃO DE SESSÃO ===================
function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function startNewSession() {
    setSessionId(generateSessionId());
    clearConversationHistory();
    isNewSession = true;
    userMessageCount = 0;
    feedbackShown = false;
    // Limpar ID do chat atual
    window.currentChatId = null;
    console.log('Nova sessão iniciada:', sessionId);
}

function clearCurrentSession() {
    if (currentRequest) cancelCurrentRequest();
    setSessionId(null);
    clearConversationHistory();
    isNewSession = true;
    userMessageCount = 0;
    feedbackShown = false;
    // Limpar ID do chat atual
    window.currentChatId = null;
    console.log('🧹 Sessão limpa');
}

// =================== SALVAMENTO ANTECIPADO ===================
async function createChatEarly(userMessage) {
    try {
        console.log('🚀 Criando chat ANTES da resposta da IA...');
        
        // Gerar título baseado na mensagem do usuário
        let chatTitle = userMessage.substring(0, 40);
        if (userMessage.length > 40) {
            chatTitle += '...';
        }
        
        // Gerar ID único
        const chatId = 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        
        // Dados do chat inicial (só com mensagem do usuário)
        const chatData = {
            id: chatId,
            title: chatTitle,
            messages: [...conversationHistory], // Histórico atual (com mensagem do usuário)
            session_id: sessionId,
            thinking_mode: currentThinkingMode || false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        console.log('📤 Salvando chat antecipadamente:', {
            id: chatId,
            title: chatTitle,
            messages: chatData.messages.length,
            session: sessionId ? sessionId.substring(0, 8) + '...' : 'null'
        });
        
        const response = await fetch('/api/chats/auto-save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(chatData)
        });
        
        const result = await response.json();
        
        if (response.ok && result.status === 'sucesso') {
            console.log('✅ Chat criado antecipadamente:', result.message);
            // Armazenar ID do chat atual
            window.currentChatId = chatId;
            return chatId;
        } else {
            console.error('❌ Erro ao criar chat antecipadamente:', result.message);
            return null;
        }
        
    } catch (error) {
        console.error('❌ Erro no salvamento antecipado:', error);
        return null;
    }
}

// =================== AUTO-SAVE FALLBACK ===================
async function autoSaveFallback() {
    try {
        console.log('🔄 Auto-save fallback - verificando currentChatId:', window.currentChatId);
        
        let chatData;
        let isUpdate = false;
        
        if (window.currentChatId) {
            // ATUALIZAR chat existente (já foi criado antecipadamente)
            console.log('📝 Atualizando chat existente:', window.currentChatId);
            isUpdate = true;
            chatData = {
                id: window.currentChatId,
                messages: [...conversationHistory], // Histórico completo com resposta da IA
                updated_at: new Date().toISOString()
            };
        } else {
            // CRIAR novo chat (fallback se salvamento antecipado falhou)
            console.log('🆕 Criando novo chat (fallback)');
            let chatTitle = 'Nova Conversa';
            const firstUserMsg = conversationHistory.find(m => m.role === 'user');
            if (firstUserMsg && firstUserMsg.content) {
                chatTitle = firstUserMsg.content.substring(0, 40) + (firstUserMsg.content.length > 40 ? '...' : '');
            }
            
            chatData = {
                id: 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                title: chatTitle,
                messages: [...conversationHistory],
                session_id: sessionId,
                thinking_mode: currentThinkingMode || false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
        }
        
        const actionText = isUpdate ? 'Atualizando' : 'Criando';
        console.log(`📤 ${actionText} chat:`, {
            id: chatData.id,
            title: chatData.title || '(mantendo título)',
            messages: chatData.messages.length,
            session: sessionId ? sessionId.substring(0, 8) + '...' : 'null'
        });
        
        const response = await fetch('/api/chats/auto-save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(chatData)
        });
        
        const result = await response.json();
        
        if (response.ok && result.status === 'sucesso') {
            const successText = isUpdate ? 'atualizado' : 'criado';
            console.log(`✅ Chat ${successText}:`, result.message);
            if (!isUpdate) {
                // Se criou novo chat no fallback, armazenar ID
                window.currentChatId = chatData.id;
            }
        } else {
            console.error('❌ Erro no auto-save:', result.message);
        }
        
    } catch (error) {
        console.error('❌ Erro no auto-save fallback:', error);
    }
}

// Função de teste manual
window.testAutoSave = function() {
    console.log('🧪 Teste manual do auto-save...');
    console.log('SessionID:', sessionId);
    console.log('CurrentChatId:', window.currentChatId);
    console.log('Mensagens:', conversationHistory ? conversationHistory.length : 0);
    
    if (sessionId && conversationHistory && conversationHistory.length > 0) {
        autoSaveFallback();
    } else {
        console.log('❌ Dados insuficientes para auto-save');
    }
};

window.testEarlySave = function(message = 'Teste de salvamento antecipado') {
    console.log('🧪 Testando salvamento antecipado...');
    if (!sessionId) {
        console.log('❌ Sessão não inicializada');
        return;
    }
    
    // Simular mensagem do usuário
    addToConversationHistory({
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
    });
    
    createChatEarly(message);
};

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
window.toggleThinkingBar = toggleThinkingBar;
window.cancelCurrentRequest = cancelCurrentRequest;
window.showTitanInfo = showTitanInfo;
window.closeTitanInfo = closeTitanInfo;
window.closeConfigDropdownChat = closeConfigDropdownChat;
window.toggleConfigDropdownChat = toggleConfigDropdownChat;
window.regenerateMessage = regenerateMessage;
window.likeMessage = likeMessage;
window.dislikeMessage = dislikeMessage;
window.copyMessage = copyMessage;
window.addMessageActions = addMessageActions;

console.log('Sistema de ações das mensagens ATIVO!');
console.log('Titan Chat - Sistema com STREAMING REAL carregado!');

// =================== FUNÇÃO AJAX FETCH ===================
async function fetchAPI(url, options = {}) {
    const defaultOptions = { credentials: 'include', ...options };
    try { const response = await fetch(url, defaultOptions); if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`); return response; }
    catch (error) { console.error('Erro na requisição:', error); throw error; }
}