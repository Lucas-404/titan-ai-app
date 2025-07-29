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
let currentRequest = null; // AbortController para cancelar requests
let userMessageCount = 0; // Contador de mensagens do usuário
let feedbackShown = false; // Se já mostrou o feedback
let isGenerating = false; // Estado de geração ativa

//  CSRF Token
let csrfToken = null;

// =================== 🔒 FUNÇÕES DE SEGURANÇA ===================
function escapeHtml(text) {
    /**
     * 🔒 ESCAPE ULTRA SEGURO - Previne XSS
     */
    if (!text || typeof text !== 'string') {
        return '';
    }

    //  ADICIONAR O CÓDIGO QUE FALTAVA:
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function sanitizeAttribute(attr) {
    /**
     * 🔒 SANITIZAÇÃO DE ATRIBUTOS
     */
    if (!attr || typeof attr !== 'string') {
        return '';
    }

    // Escapar e limitar tamanho
    return escapeHtml(attr.substring(0, 200));
}

function validateInput(input) {
    /**
     * 🔒 VALIDAÇÃO DE INPUT DO USUÁRIO
     */
    if (!input || typeof input !== 'string') {
        return false;
    }

    // Limites de segurança
    if (input.length > 2000) {
        showToast('Mensagem muito longa (máximo 2000 caracteres)', 'error');
        return false;
    }

    // Detectar tentativas de injection
    const dangerousPatterns = [
        /<script/i,
        /javascript:/i,
        /data:text\/html/i,
        /vbscript:/i,
        /on\w+\s*=/i,
        /<iframe/i,
        /<object/i,
        /<embed/i
    ];

    for (const pattern of dangerousPatterns) {
        if (pattern.test(input)) {
            return false;
        }
    }

    return true;
}

function formatMessage(content) {
    /**
     * 🔒 FORMATAÇÃO SEGURA DE MENSAGEM
     */
    if (!content || typeof content !== 'string') {
        return '';
    }

    // 1. PRIMEIRO: Escapar TUDO
    let safeContent = escapeHtml(content);

    // 2. DEPOIS: Aplicar formatação CONTROLADA
    // Bold (**texto**)
    safeContent = safeContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Italic (*texto*)
    safeContent = safeContent.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Code (`código`)
    safeContent = safeContent.replace(/`(.*?)`/g, '<code>$1</code>');

    // Line breaks
    safeContent = safeContent.replace(/\n/g, '<br>');

    return safeContent;
}

// =================== 🔒 CSRF TOKEN MANAGEMENT ===================
function initializeCsrfToken() {
    /**
     * 🔒 Inicializar CSRF token
     */
    const csrfMeta = document.querySelector('meta[name="csrf-token"]');
    if (csrfMeta) {
        csrfToken = csrfMeta.getAttribute('content');
        console.log('🔒 CSRF token carregado');
    } else {
        console.log('⚠️ CSRF token não encontrado - continuando sem');
    }
}

function getHeaders() {
    /**
     * 🔒 Headers seguros para requests
     */
    const headers = {
        'Content-Type': 'application/json'
    };

    if (csrfToken) {
        headers['X-CSRFToken'] = csrfToken;
    }

    return headers;
}

// =================== INICIALIZAÇÃO ===================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Titan Chat - Sistema carregado!');

    //  INICIALIZAR CSRF TOKEN PRIMEIRO
    initializeCsrfToken();

    clearCurrentSession();
    initializeCleanWelcome();
    createParticles();
    setupEventListeners();
    initializeOriginalSystem();
    initializeThinkingMode();
    setupThinkingModeClickOutside();
    initializeFeedbackSystem();

    if (mainInput) {
        mainInput.focus();
    }

    console.log('✨ Sistema inicializado!');
});

// =================== WELCOME LIMPO ===================
function initializeCleanWelcome() {
    isInChatMode = false;

    if (welcomeContainer) {
        welcomeContainer.style.display = 'flex';
        welcomeContainer.style.opacity = '1';
        welcomeContainer.classList.remove('hidden');
    }

    if (chatContainer) {
        chatContainer.style.display = 'none';
        chatContainer.style.opacity = '0';
        chatContainer.classList.remove('active');
    }

    console.log('🎯 Welcome inicializado');
}

// =================== SISTEMA ORIGINAL ===================
async function initializeOriginalSystem() {
    try {
        await updateSystemStatus();
        console.log('🔗 Sistema integrado');
    } catch (error) {
        console.warn('⚠️ Erro ao inicializar sistema:', error);
    }
}

async function updateSystemStatus() {
    try {
        const response = await fetch('/status');
        const data = await response.json();
        const { usuarios_ativos, maximo_usuarios, disponivel } = data;

        const statusIndicator = document.querySelector('.status-indicator span');
        if (statusIndicator) {
            if (disponivel) {
                statusIndicator.textContent = `Online • ${usuarios_ativos}/${maximo_usuarios}`;
                systemStatus = 'online';
            } else {
                statusIndicator.textContent = `Ocupado • ${usuarios_ativos}/${maximo_usuarios}`;
                systemStatus = 'busy';
            }
        }
    } catch (error) {
        systemStatus = 'offline';
        const statusIndicator = document.querySelector('.status-indicator span');
        if (statusIndicator) {
            statusIndicator.textContent = 'Offline';
        }
    }
}

// =================== PARTÍCULAS ===================
function createParticles() {
    const particlesContainer = document.getElementById('particles');
    if (!particlesContainer) return;

    particlesContainer.innerHTML = '';
    const particleCount = window.innerWidth < 768 ? 30 : 50;

    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';

        particle.style.left = Math.random() * 100 + '%';
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
        // Modo STOP - botão vermelho com ícone de parar
        if (sendBtn) {
            sendBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="2"/>
                </svg>
            `;
            sendBtn.classList.add('stop-mode');
            sendBtn.title = 'Parar geração (ESC)';
        }

        if (chatSendBtn) {
            chatSendBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="2"/>
                </svg>
            `;
            chatSendBtn.classList.add('stop-mode');
            chatSendBtn.title = 'Parar geração (ESC)';
        }

        console.log('🔴 Botões mudaram para modo STOP');
    } else {
        // Modo SEND - botão normal com ícone de enviar
        if (sendBtn) {
            sendBtn.innerHTML = `
                <svg viewBox="0 0 24 24">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
            `;
            sendBtn.classList.remove('stop-mode');
            sendBtn.title = 'Enviar mensagem (Enter)';
        }

        if (chatSendBtn) {
            chatSendBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
            `;
            chatSendBtn.classList.remove('stop-mode');
            chatSendBtn.title = 'Enviar mensagem (Enter)';
        }

        console.log('🟢 Botões voltaram para modo SEND');
    }
}

function cancelCurrentRequest() {
    if (currentRequest) {
        console.log('🛑 Cancelando request...');

        //  CANCELAR NO FRONTEND PRIMEIRO
        try {
            currentRequest.abort();
        } catch (abortError) {
            console.warn('⚠️ Erro ao abortar:', abortError);
        }
        
        currentRequest = null;

        //  INFORMAR O BACKEND (sem esperar resposta)
        fetch('/cancel-request', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ action: 'cancel' })
        }).catch(error => {
            // Ignorar erros do cancelamento no backend
            console.warn('⚠️ Backend cancel falhou:', error);
        });

        //  LIMPAR INTERFACE
        if (thinking) {
            thinking.style.display = 'none';
        }

        updateSendButtonState(false);

        //  MENSAGEM DE CANCELAMENTO
        addMessageToChat('🛑 Geração cancelada', false, {
            modo: 'Sistema',
            tempo_resposta: '0ms'
        });

        console.log(' Request cancelado com sucesso');
        return true;
    }

    console.log('ℹ️ Nenhum request ativo para cancelar');
    return false;
}

// =================== EVENT LISTENERS ===================
function setupEventListeners() {
    if (mainInput) {
        mainInput.addEventListener('keydown', handleMainInputKeydown);
        mainInput.addEventListener('focus', handleInputFocus);
        mainInput.addEventListener('blur', handleInputBlur);
        mainInput.addEventListener('input', handleInputResize);
    }

    if (sendBtn) {
        sendBtn.addEventListener('click', handleSendMessage);
    }

    const toggleBtn = document.getElementById('titanToggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleThinkingClean);
    }

    setupChatInputListeners();
    window.addEventListener('resize', handleWindowResize);
    setupKeyboardShortcuts();
    setInterval(updateSystemStatus, 180000);
}

function setupChatInputListeners() {
    const chatInput = document.getElementById('chatInput');
    const chatSendBtn = document.getElementById('chatSendBtn');

    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });

        chatInput.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = this.scrollHeight + 'px';
        });
    }

    if (chatSendBtn) {
        chatSendBtn.addEventListener('click', sendChatMessage);
    }
}

function handleMainInputKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
    }
}

function handleInputFocus() {
    const container = mainInput.closest('.main-input-container');
    if (container) {
        container.style.borderColor = '#10b981';
        container.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.15), 0 15px 50px rgba(0, 0, 0, 0.4)';
    }
}

function handleInputBlur() {
    const container = mainInput.closest('.main-input-container');
    if (container) {
        container.style.borderColor = '';
        container.style.boxShadow = '';
    }
}

function handleInputResize() {
    mainInput.style.height = 'auto';
    mainInput.style.height = mainInput.scrollHeight + 'px';
}

function handleWindowResize() {
    setTimeout(createParticles, 100);
}

// =================== ATALHOS DE TECLADO ===================
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // ESC para cancelar geração ou voltar
        if (e.key === 'Escape') {
            if (isGenerating && currentRequest) {
                // Prioridade: cancelar geração
                cancelCurrentRequest();
            } else if (settingsTabVisible) {
                toggleSettingsTab();
            } else if (isInChatMode) {
                backToWelcome();
            }
        }

        // Ctrl+K para focar input
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            focusCurrentInput();
        }

        // Ctrl+. para aba de ferramentas
        if ((e.ctrlKey || e.metaKey) && e.key === '.') {
            e.preventDefault();
            toggleSettingsTab();
        }

        // Ctrl+T para thinking mode
        if ((e.ctrlKey || e.metaKey) && e.key === 't') {
            e.preventDefault();
            toggleThinkingClean();
        }

        // Ctrl+N para nova conversa
        if ((e.ctrlKey || e.metaKey) && e.key === 'n' && isInChatMode) {
            e.preventDefault();
            startNewChat();
        }

        // Ctrl+H para histórico
        if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
            e.preventDefault();
            if (typeof toggleHistorySidebar === 'function') {
                toggleHistorySidebar();
            }
        }
    });
}

// ===================  STREAMING REAL ===================
async function handleSendMessage() {
    // Se está gerando, cancelar em vez de enviar
    if (isGenerating && currentRequest) {
        cancelCurrentRequest();
        return;
    }

    const message = mainInput?.value?.trim();
    if (!message) return;

    console.log('📤 Enviando mensagem:', message);

    if (!isInChatMode) {
        transitionToChat();
        setTimeout(() => {
            addMessageToChat(message, true);
            sendMessageToServer(message);
        }, 350);
    } else {
        addMessageToChat(message, true);
        await sendMessageToServer(message);
    }

    mainInput.value = '';
    mainInput.style.height = 'auto';
}

async function sendMessageToServer(message) {
    if (!validateInput(message)) {
        return;
    }

    if (!sessionId) {
        startNewSession();
    }

    //  ADICIONAR COMANDO AUTOMATICAMENTE BASEADO NO THINKING MODE
    let finalMessage = message.trim();

    // Verificar se já tem comando manual
    const hasManualCommand = finalMessage.includes('/think') || finalMessage.includes('/no_think');

    if (!hasManualCommand) {
        // Adicionar comando baseado no modo atual
        if (currentThinkingMode) {
            finalMessage += ' /think';
            console.log('🟣 [FRONTEND] Adicionado /think automaticamente');
        } else {
            finalMessage += ' /no_think';
            console.log('🔴 [FRONTEND] Adicionado /no_think automaticamente');
        }
    } else {
        console.log('🎯 [FRONTEND] Comando manual detectado, mantendo original');
    }

    // Criar novo AbortController
    currentRequest = new AbortController();
    updateSendButtonState(true);

    conversationHistory.push({
        role: 'user',
        content: message, //  Salvar a mensagem original sem comando
        timestamp: new Date().toISOString()
    });

    const streamContainer = createStreamingContainer();

    try {
        console.log(' Iniciando streaming com mensagem:', finalMessage);

        //  ENVIAR A MENSAGEM COM COMANDO PARA O BACKEND
        await streamWithFetchStream(finalMessage, streamContainer);

    } catch (error) {
        if (error.name !== 'AbortError') {
            showError('Falha na comunicação com o servidor');
        }
    } finally {
        currentRequest = null;
        updateSendButtonState(false);
        thinking.style.display = 'none';
    }
}

async function sendChatMessage() {
    // Se está gerando, cancelar em vez de enviar
    if (isGenerating && currentRequest) {
        cancelCurrentRequest();
        return;
    }

    const chatInput = document.getElementById('chatInput');
    const message = chatInput?.value?.trim();
    if (!message) return;

    //  ADICIONAR COMANDO AUTOMATICAMENTE
    let finalMessage = message.trim();

    const hasManualCommand = finalMessage.includes('/think') || finalMessage.includes('/no_think');

    if (!hasManualCommand) {
        if (currentThinkingMode) {
            finalMessage += ' /think';
            console.log('🟣 [CHAT] Adicionado /think automaticamente');
        } else {
            finalMessage += ' /no_think';
            console.log('🔴 [CHAT] Adicionado /no_think automaticamente');
        }
    }

    console.log('📤 Enviando do chat:', finalMessage);

    addMessageToChat(message, true); //  Mostrar mensagem original
    chatInput.value = '';
    chatInput.style.height = 'auto';
    await sendMessageToServer(finalMessage); //  Enviar com comando
}

async function streamWithFetchStream(message, container) {
    return new Promise((resolve, reject) => {
        console.log(' Iniciando stream para:', message);
        let thinkingContainerRef = null; // Inicializar aqui

        if (currentThinkingMode) {
            thinkingContainerRef = createThinkingContainer(container);
        }
        
        //  TIMEOUT MAIOR PARA OLLAMA
        const timeoutMs = 60000; // 60 segundos para Ollama responder
        let timeoutId = null;

        //  TIMEOUT MANUAL EM VEZ DE DEIXAR O BROWSER DECIDIR
        timeoutId = setTimeout(() => {
            if (currentRequest && !currentRequest.signal.aborted) {
                console.warn('⏰ Timeout manual - cancelando request');
                currentRequest.abort();
                reject(new Error('Timeout: O modelo demorou muito para responder'));
            }
        }, timeoutMs);
        
        fetch('/chat-stream', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                mensagem: message,
                thinking_mode: currentThinkingMode
            }),
            signal: currentRequest.signal
        })
        .then(response => {
            //  LIMPAR TIMEOUT SE RESPOSTA CHEGOU
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }

            console.log(' Response status:', response.status, 'headers:', Object.fromEntries(response.headers.entries()));
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            if (!response.body) {
                throw new Error('Response body é null');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let fullContent = '';
            let thinkingContent = '';
            
            let contentElement = container.querySelector('.streaming-content');
            let thinkingContainer = null;
            let isStreamComplete = false;
            let lastUpdateTime = Date.now();

            // Esconder thinking indicator
            thinking.style.display = 'none';

            function processStream() {
                return reader.read().then(({ done, value }) => {
                    //  ATUALIZAR TIMESTAMP DE ATIVIDADE
                    lastUpdateTime = Date.now();

                    //  VERIFICAR ABORT MAIS CUIDADOSAMENTE
                    if (currentRequest && currentRequest.signal.aborted) {
                        console.log('🛑 Stream abortado pelo usuário');
                        reader.cancel('Usuário cancelou');
                        return Promise.resolve();
                    }

                    if (done) {
                        console.log(' Stream concluído naturalmente - Content length:', fullContent.length);
                        
                        //  VERIFICAR SE REALMENTE TEM CONTEÚDO
                        if (!fullContent || fullContent.trim().length === 0) {
                            console.warn('⚠️ Stream terminou sem conteúdo!');
                            reject(new Error('Stream terminou sem conteúdo'));
                            return;
                        }

                        isStreamComplete = true;
                        finalizeStreamingMessage(container, fullContent, thinkingContent);
                        resolve(fullContent);
                        return;
                    }

                    if (!value || value.length === 0) {
                        console.warn('⚠️ Chunk vazio recebido, continuando...');
                        return processStream();
                    }

                    //  DECODIFICAR COM TRATAMENTO DE ERRO
                    let decodedChunk;
                    try {
                        decodedChunk = decoder.decode(value, { stream: true });
                    } catch (decodeError) {
                        console.error(' Erro ao decodificar chunk:', decodeError);
                        return processStream();
                    }

                    //  DEBUG DO CHUNK RECEBIDO
                    console.log('Chunk recebido:', decodedChunk.length, 'bytes');

                    buffer += decodedChunk;
                    
                    //  PROCESSAR LINHAS COM MELHOR HANDLING
                    const lines = buffer.split('\n');
                    // Manter última linha incompleta no buffer
                    buffer = lines.pop() || ''; 

                    let hasValidData = false;

                    for (const line of lines) {
                        const trimmedLine = line.trim();
                        if (!trimmedLine) continue;
                        
                        if (trimmedLine.startsWith('data: ')) {
                            try {
                                const jsonData = trimmedLine.slice(5).trim();
                                if (!jsonData || jsonData === '[DONE]') continue;
                                
                                const data = JSON.parse(jsonData);
                                console.log('📋 SSE Data:', data.type, data.content ? data.content.length + ' chars' : 'no content');
                                hasValidData = true;

                                if (data.error) {
                                    console.error(' Erro do servidor:', data.error);
                                    showError(data.error);
                                    reject(new Error(data.error));
                                    return;
                                }

                                //  THINKING PROCESSING
                                if (data.type === 'thinking_chunk') {
                                    const newThinkingChunk = data.content || '';
                                    if (currentThinkingMode && thinkingContainerRef) {
                                        thinkingContent += newThinkingChunk; // Acumula o pensamento
                                        updateThinkingContent(thinkingContainerRef, thinkingContent);
                                    }
                                } else if (data.type === 'thinking_done') {
                                    thinkingContent = data.thinking || '';
                                    console.log('🧠 Thinking recebido (final):', thinkingContent.length, 'chars');
                                    
                                    if (currentThinkingMode && thinkingContainerRef) {
                                        updateThinkingContent(thinkingContainerRef, thinkingContent);
                                    }
                                }

                                //  CONTENT UPDATE COM DEBUG
                                else if (data.type === 'content') {
                                    const newContent = data.buffer || data.content || '';
                                    if (newContent) {
                                        const oldLength = fullContent.length;
                                        fullContent += newContent;
                                        console.log('📝 Conteúdo atualizado:', oldLength, '->', fullContent.length, 'chars');
                                        
                                        if (contentElement) {
                                            contentElement.innerHTML = formatMessage(fullContent);
                                            scrollToBottom();
                                        }
                                    }
                                }

                                //  COMPLETION
                                else if (data.type === 'done') {
                                    console.log('🏁 Stream marcado como concluído pelo servidor');
                                    fullContent = data.final_content || fullContent;
                                    thinkingContent = data.thinking || thinkingContent;
                                    console.log('🏁 Final content length:', fullContent.length);
                                }

                            } catch (parseError) {
                                console.warn('⚠️ Erro ao parsear JSON:', parseError.message, 'Linha:', trimmedLine.substring(0, 100));
                            }
                        } else if (trimmedLine !== '' && !trimmedLine.startsWith('event:')) {
                            console.warn('⚠️ Linha não-SSE recebida:', trimmedLine.substring(0, 50) + '...');
                        }
                    }

                    //  SE NÃO RECEBEU DADOS VÁLIDOS HÁ MUITO TEMPO, AVISAR
                    if (!hasValidData && (Date.now() - lastUpdateTime) > 30000) {
                        console.warn('⚠️ Sem dados válidos há 30s, possível problema na conexão');
                    }

                    //  CONTINUAR STREAM
                    return processStream();
                })
                .catch(streamError => {
                    //  LIMPAR TIMEOUT EM CASO DE ERRO
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                        timeoutId = null;
                    }

                    if (streamError.name === 'AbortError' || (currentRequest && currentRequest.signal.aborted)) {
                        console.log('🛑 Stream cancelado intencionalmente');
                        return Promise.resolve();
                    } else {
                        console.error(' Erro no stream:', streamError);
                        throw streamError;
                    }
                });
            }

            return processStream();
        })
        .catch(error => {
            //  LIMPAR TIMEOUT EM CASO DE ERRO
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }

            if (error.name === 'AbortError' || (currentRequest && currentRequest.signal.aborted)) {
                console.log('🛑 Fetch cancelado intencionalmente');
                return Promise.resolve();
            } else {
                console.error(' Erro na requisição:', error);
                showError('Erro na conexão: ' + error.message);
                reject(error);
            }
        });
    });
}

//  SCROLL INSTANTÂNEO
function scrollToBottom() {
    const messagesContainer = document.getElementById('chatMessages');
    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

//  FORMATAÇÃO ULTRA-RÁPIDA
function formatMessage(content) {
    if (!content || typeof content !== 'string') {
        return '';
    }

    //  ESCAPE RÁPIDO
    const div = document.createElement('div');
    div.textContent = content;
    let safeContent = div.innerHTML;
    
    //  FORMATAÇÃO MÍNIMA E RÁPIDA
    return safeContent
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
}

//  NOVA FUNÇÃO: Criar container de thinking em tempo real
function createThinkingContainer(messageContainer) {
    const assistantDiv = messageContainer.querySelector('.assistant-message');
    if (!assistantDiv) return null;

    // Criar thinking container
    const thinkingHTML = `
        <div class="thinking-container live-thinking">
            <div class="thinking-header" onclick="toggleThinking(this)">
                <span class="thinking-icon">🧠</span>
                <span class="thinking-summary">Pensando em tempo real...</span>
                <span class="thinking-toggle">▼</span>
            </div>
            <div class="thinking-content expanded">
                <div class="thinking-scroll"></div>
            </div>
        </div>
    `;

    assistantDiv.insertAdjacentHTML('afterbegin', thinkingHTML);

    const thinkingContainer = assistantDiv.querySelector('.thinking-container');
    const thinkingContent = thinkingContainer.querySelector('.thinking-content');

    // Mostrar expandido por padrão durante o thinking
    thinkingContainer.classList.add('expanded');
    thinkingContent.style.maxHeight = '300px';

    return thinkingContainer;
}

//  NOVA FUNÇÃO: Atualizar thinking em tempo real
function updateThinkingContent(thinkingContainer, content) {
    if (!thinkingContainer) return;

    const scroll = thinkingContainer.querySelector('.thinking-scroll');
    if (scroll) {
        scroll.textContent = content;

        // Auto-scroll para o final
        scroll.scrollTop = scroll.scrollHeight;
    }
}

//  FUNÇÕES DE STREAMING REAL
function createStreamingContainer() {
    const messagesContainer = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message streaming-message';

    messageDiv.innerHTML = `
        <div class="avatar assistant-avatar">T</div>
        <div class="assistant-message">
            <div class="message-content streaming-content"></div>
            <div class="streaming-cursor">|</div>
        </div>
    `;

    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
    return messageDiv;
}

function updateStreamingContent(container, content) {
    const contentDiv = container.querySelector('.streaming-content');
    if (contentDiv) {
        contentDiv.innerHTML = formatMessage(content);
    }
}

function finalizeStreamingMessage(container, content, thinking = null) {
    container.classList.remove('streaming-message');

    const cursor = container.querySelector('.streaming-cursor');
    if (cursor) cursor.remove();

    const assistantDiv = container.querySelector('.assistant-message');
    if (!assistantDiv) return;

    //  ADICIONAR THINKING SE PRESENTE
    if (thinking && thinking.trim() && currentThinkingMode) {
        const thinkingContainer = assistantDiv.querySelector('.thinking-container');
        if (thinkingContainer) {
            const thinkingScroll = thinkingContainer.querySelector('.thinking-scroll');
            if (thinkingScroll) {
                thinkingScroll.innerHTML = escapeHtml(thinking);
            }
            const thinkingSummary = thinkingContainer.querySelector('.thinking-summary');
            if (thinkingSummary) {
                thinkingSummary.textContent = 'Processo de raciocínio';
            }
            thinkingContainer.classList.remove('live-thinking');
            thinkingContainer.classList.remove('expanded');
            thinkingContainer.querySelector('.thinking-content').style.maxHeight = '0';
            thinkingContainer.querySelector('.thinking-toggle').textContent = '▼';
        }
        console.log('🧠 Thinking finalizado e adicionado à mensagem!');
    }

    // Mensagem principal
    const contentDiv = container.querySelector('.streaming-content');
    if (contentDiv) {
        contentDiv.innerHTML = formatMessage(content);
        contentDiv.classList.remove('streaming-content');
    }

    scrollToBottom();
}

// =================== TRANSIÇÃO PARA CHAT ===================
function transitionToChat() {
    console.log('🔄 Transicionando para chat...');

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

                setTimeout(() => {
                    chatContainer.style.opacity = '1';
                }, 50);
            }
        }, 300);
    }
}

function setupChatInterface() {
    const messagesContainer = document.getElementById('chatMessages');
    if (messagesContainer && messagesContainer.children.length === 0) {
        messagesContainer.innerHTML = '';
    }

    // Mostrar chat input
    const chatInputArea = document.getElementById('chatInputArea');
    if (chatInputArea) {
        chatInputArea.style.display = 'block';

        // Focar no input
        setTimeout(() => {
            const chatInput = document.getElementById('chatInput');
            if (chatInput) chatInput.focus();
        }, 200);
    }

    console.log('🎮 Interface do chat configurada');
}

// =================== VOLTAR PARA WELCOME ===================
function backToWelcome() {
    console.log('🔄 Voltando para Welcome...');

    // Cancelar qualquer request ativo antes de sair
    if (currentRequest) {
        cancelCurrentRequest();
    }

    isInChatMode = false;

    if (chatContainer) {
        chatContainer.style.opacity = '0';
        chatContainer.classList.remove('active');
    }

    setTimeout(() => {
        if (chatContainer) {
            chatContainer.style.display = 'none';
        }

        // Esconder chat input
        const chatInputArea = document.getElementById('chatInputArea');
        if (chatInputArea) {
            chatInputArea.style.display = 'none';
        }

        if (welcomeContainer) {
            welcomeContainer.style.display = 'flex';
            welcomeContainer.style.opacity = '0';
            welcomeContainer.style.transform = 'scale(0.95)';
            welcomeContainer.classList.remove('hidden');

            setTimeout(() => {
                welcomeContainer.style.opacity = '1';
                welcomeContainer.style.transform = 'scale(1)';

                if (mainInput) {
                    mainInput.value = '';
                    mainInput.focus();
                }
            }, 50);
        }
    }, 300);
}

// =================== 🔒 GERENCIAMENTO SEGURO DE MENSAGENS ===================
function addMessageToChat(content, isUser, systemInfo = null) {
    const messagesContainer = document.getElementById('chatMessages');
    if (!messagesContainer) {
        console.error('Elemento #chatMessages não encontrado no DOM!');
        return;
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    if (isUser) messageDiv.classList.add('user');

    if (isUser) {
        console.log('Adicionando mensagem do usuário:', content);

        // 🔒 CONTEÚDO DO USUÁRIO - ESCAPE TOTAL
        const safeContent = escapeHtml(content);

        messageDiv.innerHTML = `
            <div class="user-message">
                <div class="message-content">${safeContent}</div>
            </div>
            <div class="avatar user-avatar">U</div>
        `;
    } else {
        // 🔒 MENSAGEM DO ASSISTENTE - FORMATAÇÃO SEGURA
        const mode = systemInfo?.modo || (currentThinkingMode ? 'Raciocínio' : 'Direto');
        const tempoResposta = systemInfo?.tempo_resposta || '';
        const temPensamento = systemInfo?.tem_pensamento || false;
        const pensamento = systemInfo?.pensamento || '';

        let messageContent = '';

        if (currentThinkingMode && temPensamento && pensamento) {
            // 🔒 ESCAPE PENSAMENTO TAMBÉM
            const safePensamento = escapeHtml(pensamento);
            const safeContent = formatMessage(content);
            const safeMode = sanitizeAttribute(mode);
            const safeTempoResposta = escapeHtml(tempoResposta);

            messageContent = `
                <div class="avatar assistant-avatar">T</div>
                <div class="assistant-message message-block" data-mode="${safeMode}">
                    <div class="thinking-container">
                        <div class="thinking-header" onclick="toggleThinking(this)">
                            <span class="thinking-icon">🧠</span>
                            <span class="thinking-summary">Pensou por ${safeTempoResposta}</span>
                            <span class="thinking-toggle">▼</span>
                        </div>
                        <div class="thinking-content">
                            <div class="thinking-scroll">${safePensamento}</div>
                        </div>
                    </div>
                    <div class="message-content">${safeContent}</div>
                </div>
            `;
        } else {
            // 🔒 RESPOSTA SIMPLES - TAMBÉM SEGURA
            const safeContent = formatMessage(content);
            const safeMode = sanitizeAttribute(mode);
            const safeTempoResposta = escapeHtml(tempoResposta);

            messageContent = `
                <div class="avatar assistant-avatar">T</div>
                <div class="assistant-message" data-mode="${safeMode}">
                    <div class="message-content">${safeContent}</div>
                    ${tempoResposta ? `<div class="response-time">${safeTempoResposta}</div>` : ''}
                </div>
            `;
        }

        messageDiv.innerHTML = messageContent;
    }

    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
}

function toggleThinking(header) {
    const container = header.parentElement;
    const content = container.querySelector('.thinking-content');
    const toggle = container.querySelector('.thinking-toggle');

    if (!content || !toggle) {
        console.error('Elementos thinking-content ou thinking-toggle não encontrados!');
        return;
    }

    if (container.classList.contains('expanded')) {
        container.classList.remove('expanded');
        content.style.maxHeight = '0';
        toggle.textContent = '▼';
    } else {
        container.classList.add('expanded');
        content.style.maxHeight = content.scrollHeight + 'px';
        toggle.textContent = '▲';
    }
    scrollToBottom();
}

function scrollToBottom() {
    const messagesContainer = document.getElementById('chatMessages');
    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

function showError(message) {
    const safeMessage = escapeHtml(message);
    addMessageToChat(` Erro: ${safeMessage}`, false);
    console.error('Erro no chat:', message);
}

function showQueueMessage(queueInfo) {
    const safeMessage = `🕐 Titan está ocupado. Você é o ${escapeHtml(queueInfo.posicao)}º na fila. ` +
        `Tempo estimado: ${escapeHtml(queueInfo.tempo_estimado_str)}`;
    addMessageToChat(safeMessage, false);

    setTimeout(() => {
        const chatInput = document.getElementById('chatInput');
        const lastMessage = chatInput?.value?.trim();
        if (lastMessage) {
            sendMessageToServer(lastMessage);
        }
    }, queueInfo.tempo_estimado * 1000);
}

// =================== ABA DE FERRAMENTAS ===================
function toggleSettingsTab() {
    const settingsTab = document.getElementById('settingsTab');
    if (!settingsTab) return;

    settingsTabVisible = !settingsTabVisible;

    if (settingsTabVisible) {
        settingsTab.classList.add('active');
        updateSettingsButtonStates();
    } else {
        settingsTab.classList.remove('active');
        updateSettingsButtonStates();
    }
}

function updateSettingsButtonStates() {
    const settingsBtns = document.querySelectorAll('.settings-btn');
    settingsBtns.forEach(btn => {
        if (settingsTabVisible) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// =================== THINKING MODE ===================
async function toggleThinkingClean() {
    const newMode = !currentThinkingMode;
    console.log('🔄 Mudando thinking mode para:', newMode ? 'ATIVADO' : 'DESATIVADO');

    try {
        const response = await fetch('/thinking-mode', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ enabled: newMode })
        });

        const data = await response.json();
        console.log(' Resposta do servidor:', data);

        if (data.status === 'sucesso') {
            currentThinkingMode = newMode;
            applyTheme(currentThinkingMode);
            updateThinkingToggleVisual();

            console.log(' Thinking mode atualizado:', currentThinkingMode ? 'ATIVADO' : 'DESATIVADO');

            // Mostrar feedback visual
            showToast(`🧠 Modo ${currentThinkingMode ? 'Raciocínio' : 'Direto'} ativado`, 'success');
        } else {
            console.error(' Erro do servidor:', data);
            throw new Error('Falha no servidor');
        }
    } catch (error) {
        console.error(' Erro ao alterar thinking mode:', error);
        // Fallback: aplicar localmente mesmo com erro
        currentThinkingMode = newMode;
        applyTheme(currentThinkingMode);
        updateThinkingToggleVisual();
    }
}

async function initializeThinkingMode() {
    try {
        const response = await fetch('/thinking-mode');
        const data = await response.json();
        currentThinkingMode = data.thinking_mode;
        applyTheme(currentThinkingMode);
        updateThinkingToggleVisual();
        console.log(`🧠 Thinking mode inicial: ${currentThinkingMode ? 'ATIVADO' : 'DESATIVADO'}`);
    } catch (error) {
        console.warn('⚠️ Erro ao carregar thinking mode:', error);
        currentThinkingMode = false;
        applyTheme(false);
        updateThinkingToggleVisual();
    }
}

function applyTheme(isThinkingMode) {
    const body = document.body;
    if (isThinkingMode) {
        body.classList.add('thinking-theme');
        console.log('🟣 Tema ROXO ativado');
    } else {
        body.classList.remove('thinking-theme');
        console.log('🟢 Tema VERDE ativado');
    }
}

function updateThinkingToggleVisual() {
    const toggle = document.getElementById('titanToggle');
    const icon = document.getElementById('thinkingModeIcon');
    const title = document.getElementById('thinkingModeTitle');

    if (toggle) {
        if (currentThinkingMode) {
            toggle.classList.add('active');
            console.log('🟣 Toggle visual: ATIVADO');
        } else {
            toggle.classList.remove('active');
            console.log('🟢 Toggle visual: DESATIVADO');
        }

        if (icon) icon.textContent = '🧠';
        if (title) title.textContent = 'Pensamento prolongado';
    }
}

// =================== OUTRAS FUNÇÕES ===================
function setQuickExample(example) {
    if (!mainInput) return;

    // 🔒 SANITIZAR EXEMPLO ANTES DE USAR
    const safeExample = escapeHtml(example);
    mainInput.value = safeExample;
    mainInput.focus();

    const container = mainInput.closest('.main-input-container');
    if (container) {
        container.style.borderColor = '#f59e0b';
        container.style.boxShadow = '0 0 0 3px rgba(245, 158, 11, 0.15)';

        setTimeout(() => {
            container.style.borderColor = '';
            container.style.boxShadow = '';
        }, 1500);
    }
}

function showKeyboardShortcuts() {
    const modal = document.getElementById('shortcutsModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

function startNewChat() {
    console.log('🆕 Nova conversa - RESET COMPLETO');

    // Cancelar requests
    if (currentRequest) {
        cancelCurrentRequest();
    }

    // Limpar tudo
    clearCurrentSession();
    userMessageCount = 0;
    feedbackShown = false;

    // Reset DOM
    const messagesContainer = document.getElementById('chatMessages');
    if (messagesContainer) {
        messagesContainer.innerHTML = '';
    }

    const chatInputArea = document.getElementById('chatInputArea');
    if (chatInputArea) {
        chatInputArea.style.display = 'none';
    }

    // FORÇA transição para welcome
    isInChatMode = false;

    if (chatContainer) {
        chatContainer.style.display = 'none';
        chatContainer.style.opacity = '0';
        chatContainer.classList.remove('active');
    }

    if (welcomeContainer) {
        welcomeContainer.style.display = 'flex';
        welcomeContainer.style.opacity = '1';
        welcomeContainer.style.transform = 'scale(1)';
        welcomeContainer.classList.remove('hidden');
    }

    // Focar input
    if (mainInput) {
        mainInput.value = '';
        setTimeout(() => mainInput.focus(), 100);
    }

    console.log(' Reset completo para welcome');
}

function focusCurrentInput() {
    const chatInput = document.getElementById('chatInput');
    const mainInput = document.getElementById('mainInput');

    if (isInChatMode && chatInput && chatInput.offsetParent !== null) {
        chatInput.focus();
    } else if (mainInput) {
        mainInput.focus();
    }
}

// =================== GESTÃO DE SESSÃO ===================
function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function startNewSession() {
    sessionId = generateSessionId();
    conversationHistory = [];
    isNewSession = true;

    // Reset contadores para nova sessão
    userMessageCount = 0;
    feedbackShown = false;

    console.log('🆕 Nova sessão iniciada:', sessionId);
}

function clearCurrentSession() {
    // Cancelar request ativo antes de limpar
    if (currentRequest) {
        cancelCurrentRequest();
    }

    sessionId = null;
    conversationHistory = [];
    isNewSession = true;

    // Reset contadores
    userMessageCount = 0;
    feedbackShown = false;

    console.log('🧹 Sessão limpa');
}

// =================== EVENTOS DE PÁGINA ===================
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        setTimeout(() => {
            const particles = document.getElementById('particles');
            if (particles && particles.children.length === 0) {
                createParticles();
            }
        }, 500);
    }
});

window.addEventListener('beforeunload', (e) => {
    // Cancelar request ativo antes de sair da página
    if (currentRequest) {
        console.log('🚪 Cancelando request antes de sair da página...');
        cancelCurrentRequest();
    }

    // Proteção contra fechamento acidental durante geração
    if (isGenerating && currentRequest) {
        e.preventDefault();
        e.returnValue = 'Há uma geração em andamento. Tem certeza que deseja sair?';
        return e.returnValue;
    }

    if (sessionId) {
        navigator.sendBeacon('/end-session', JSON.stringify({
            session_id: sessionId,
            timestamp: new Date().toISOString()
        }));
    }
});

// =================== CLIQUE FORA PARA FECHAR ===================
function setupThinkingModeClickOutside() {
    document.addEventListener('click', function (e) {
        const thinkingButton = document.getElementById('titanToggle');
        const thinkingSetting = document.querySelector('.thinking-setting');
        const settingsTab = document.getElementById('settingsTab');

        const settingsButtons = document.querySelectorAll('.settings-btn');
        let clickedOnSettingsBtn = false;
        settingsButtons.forEach(btn => {
            if (btn.contains(e.target)) {
                clickedOnSettingsBtn = true;
            }
        });

        // Verificar se clicou fora de todos os elementos relacionados
        if (!thinkingButton?.contains(e.target) &&
            !thinkingSetting?.contains(e.target) &&
            !settingsTab?.contains(e.target) &&
            !clickedOnSettingsBtn) {

            // Se o settings tab estiver aberto, fechar apenas ele
            if (settingsTabVisible) {
                toggleSettingsTab();
            }
        }
    });
}

function debugSessionInfo() {
    console.log('DEBUG Sessão:', {
        sessionId: sessionId ? sessionId.substring(0, 8) + '...' : 'null',
        isInChatMode: isInChatMode,
        conversationHistory: conversationHistory.length,
        csrfToken: csrfToken ? 'presente' : 'ausente',
        currentThinkingMode: currentThinkingMode
    });
}

// =================== DEBUG FUNCTION ===================
// =================== DEBUG MELHORADO ===================
function debugConnection() {
    console.log('=== DEBUG CONEXÃO ===');
    console.log('Estado atual:', {
        currentRequest: !!currentRequest,
        isGenerating: isGenerating,
        sessionId: sessionId,
        currentThinkingMode: currentThinkingMode
    });
    
    // Testar timeout do navegador
    const testController = new AbortController();
    const startTime = Date.now();
    
    fetch('/status', { 
        signal: testController.signal 
    })
    .then(response => {
        console.log(' Conexão OK -', Date.now() - startTime, 'ms');
        return response.json();
    })
    .then(data => {
        console.log(' Status do servidor:', data);
    })
    .catch(error => {
        console.log(' Erro de conexão:', error);
    });
    
    // Testar streaming básico
    console.log(' Testando stream...');
    fetch('/chat-stream', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
            mensagem: 'teste rápido',
            thinking_mode: false
        })
    })
    .then(response => {
        console.log(' Stream response:', response.status, response.headers.get('content-type'));
        if (response.body) {
            console.log(' Response body disponível');
        } else {
            console.log(' Response body NULL');
        }
    })
    .catch(error => {
        console.log(' Erro no stream test:', error);
    });
}

// Exportar para console
window.debugConnection = debugConnection;

// =================== EXPORTAR FUNÇÕES GLOBAIS ===================
window.setQuickExample = setQuickExample;
window.toggleSettingsTab = toggleSettingsTab;
window.toggleThinkingClean = toggleThinkingClean;
window.showKeyboardShortcuts = showKeyboardShortcuts;
window.closeModal = closeModal;
window.startNewChat = startNewChat;
window.backToWelcome = backToWelcome;
window.toggleThinking = toggleThinking;
window.cancelCurrentRequest = cancelCurrentRequest;

console.log(' Titan Chat - Sistema com STREAMING REAL carregado!');