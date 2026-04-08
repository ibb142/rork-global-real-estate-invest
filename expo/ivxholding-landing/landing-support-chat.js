(function () {
  var QUICK_REPLIES = [
    'How do I invest?',
    'Frontend or app issue',
    'AWS or backend support',
    'ChatGPT integration help',
    'Speak with management'
  ];

  var state = {
    initialized: false,
    busy: false,
    client: null,
    messages: []
  };

  function isPlaceholder(value) {
    return !value || value.indexOf('__IVX_') === 0 || value.length < 10;
  }

  function getMeta(name) {
    var element = document.querySelector('meta[name="' + name + '"]');
    return element ? String(element.content || '').trim() : '';
  }

  function getSupabaseConfig() {
    var url = getMeta('ivx-sb-url');
    var key = getMeta('ivx-sb-key');

    if (isPlaceholder(url)) {
      url = getMeta('ivx-sb-url-fallback');
    }

    if (isPlaceholder(key)) {
      key = getMeta('ivx-sb-key-fallback');
    }

    if (isPlaceholder(url) || isPlaceholder(key)) {
      try {
        var cached = JSON.parse(localStorage.getItem('ivx_sb_config') || '{}');
        if (cached && cached.url && !isPlaceholder(cached.url)) {
          url = cached.url;
        }
        if (cached && cached.key && !isPlaceholder(cached.key)) {
          key = cached.key;
        }
      } catch (error) {
        console.warn('[IVX Landing Chat] Cached config read failed:', error && error.message ? error.message : error);
      }
    }

    return { url: url, key: key };
  }

  function getClient() {
    if (state.client) {
      return state.client;
    }

    var config = getSupabaseConfig();
    if (!window.supabase || isPlaceholder(config.url) || isPlaceholder(config.key)) {
      return null;
    }

    try {
      state.client = window.supabase.createClient(config.url, config.key);
      return state.client;
    } catch (error) {
      console.warn('[IVX Landing Chat] Supabase client init failed:', error && error.message ? error.message : error);
      return null;
    }
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (character) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[character] || character;
    });
  }

  function formatTime(value) {
    try {
      return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  function buildMessage(role, text) {
    return {
      id: 'landing-chat-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      role: role,
      text: text,
      timestamp: new Date().toISOString()
    };
  }

  function getElements() {
    return {
      shell: document.getElementById('landing-chat-shell'),
      messages: document.getElementById('landing-chat-messages'),
      input: document.getElementById('landing-chat-input'),
      send: document.getElementById('landing-chat-send'),
      human: document.getElementById('landing-chat-human'),
      statusDot: document.getElementById('landing-chat-status-dot'),
      statusTitle: document.getElementById('landing-chat-status-title'),
      statusSubtext: document.getElementById('landing-chat-status-subtext'),
      statusBadge: document.getElementById('landing-chat-status-live'),
      quickReplyButtons: document.querySelectorAll('.landing-chat-quick-reply')
    };
  }

  function setStatus(title, subtitle, tone) {
    var elements = getElements();
    if (!elements.statusTitle || !elements.statusSubtext || !elements.statusDot || !elements.statusBadge) {
      return;
    }

    elements.statusTitle.textContent = title;
    elements.statusSubtext.textContent = subtitle;
    elements.statusDot.className = 'landing-chat-status-dot ' + (tone === 'waiting' ? 'is-waiting' : tone === 'warning' ? 'is-warning' : 'is-connected');
    elements.statusBadge.className = 'landing-chat-status-live ' + (tone === 'warning' ? 'is-warning' : 'is-active');
    elements.statusBadge.textContent = tone === 'waiting'
      ? 'Working now'
      : tone === 'warning'
        ? 'Fallback + direct contact'
        : 'AI + human support';
  }

  function updateBusyState() {
    var elements = getElements();
    if (!elements.shell || !elements.send || !elements.human || !elements.input) {
      return;
    }

    elements.shell.classList.toggle('is-loading', state.busy);
    elements.send.disabled = state.busy;
    elements.human.disabled = state.busy;
    elements.input.disabled = state.busy;
    elements.send.textContent = state.busy ? 'Sending…' : 'Send →';
    elements.human.textContent = state.busy ? 'Working…' : 'Request Live Investor Support';
  }

  function renderMessages() {
    var elements = getElements();
    if (!elements.messages) {
      return;
    }

    elements.messages.innerHTML = state.messages.map(function (message) {
      var label = message.role === 'user' ? 'You' : 'IVX AI';
      return [
        '<div class="landing-chat-message ' + (message.role === 'user' ? 'is-user' : 'is-support') + '">',
        '<div class="landing-chat-message-label">' + label + '</div>',
        '<div class="landing-chat-message-copy">' + escapeHtml(message.text) + '</div>',
        '<div class="landing-chat-message-meta">' + escapeHtml(formatTime(message.timestamp)) + '</div>',
        '</div>'
      ].join('');
    }).join('');

    elements.messages.scrollTop = elements.messages.scrollHeight;
  }

  function appendMessage(role, text) {
    state.messages.push(buildMessage(role, text));
    renderMessages();
  }

  function buildConversationSummary() {
    return state.messages
      .slice(-8)
      .map(function (message) {
        return (message.role === 'user' ? 'User' : 'Assistant') + ': ' + message.text;
      })
      .join('\n');
  }

  function buildPrompt(userText, conversationSummary) {
    return [
      'You are the IVX Holdings LLC investor and platform support assistant for the public landing page.',
      'Facts:',
      '- Legal entity: IVX Holdings LLC',
      '- Investor relations: investors@ivxholding.com',
      '- Phone: +1 (561) 644-3503',
      '- Business address: 1001 Brickell Bay Drive, Suite 2700, Miami, FL 33131',
      '- Public visitors can request investor access through the intake on this page.',
      '- Approved members move into registration, profile activation, wallet readiness, and transaction visibility.',
      '- Qualified prospects can request management diligence calls during active review.',
      '- The platform can answer investor questions, account-support questions, and high-level technical questions about the IVX mobile and web frontend, backend services, Supabase flows, AWS S3/CloudFront, and ChatGPT or OpenAI-style AI chat integrations.',
      '- Never guarantee returns, liquidity, uptime, or automatic code fixes.',
      '- If execution or incident review is required, direct the visitor to live support.',
      'For technical questions, explain what the stack supports now, what to check next, and when a human should take over.',
      'Keep answers concise, factual, and investor-ready.',
      conversationSummary ? 'Recent conversation:\n' + conversationSummary : '',
      'User question: ' + userText
    ].filter(Boolean).join('\n');
  }

  function buildFallback(userText) {
    var lowerText = String(userText || '').toLowerCase();

    if ((lowerText.indexOf('how') !== -1 && lowerText.indexOf('invest') !== -1) || lowerText.indexOf('start') !== -1) {
      return 'Start with the investor intake on this page, complete the verified contact and identity fields, and IVX will review eligibility before live allocation access is opened. Minimums and deal terms can vary by opportunity, and returns are never guaranteed.';
    }

    if (lowerText.indexOf('minimum') !== -1 || lowerText.indexOf('$50') !== -1 || lowerText.indexOf('allocation') !== -1) {
      return 'IVX supports access from $50 on supported offerings, but each live opportunity can have its own allocation rules, timing, and investor suitability steps. Review the deal terms carefully before committing.';
    }

    if (lowerText.indexOf('wallet') !== -1 || lowerText.indexOf('profile') !== -1 || lowerText.indexOf('member') !== -1) {
      return 'After approval, investors move into member registration, saved profile setup, wallet preparation, and transaction visibility inside the platform. The public intake is the first step before those member tools are opened.';
    }

    if (lowerText.indexOf('management') !== -1 || lowerText.indexOf('team') !== -1 || lowerText.indexOf('call') !== -1) {
      return 'Qualified prospects can request a management diligence call during active review. Use the live support button below or contact investors@ivxholding.com and the IVX team will coordinate next steps.';
    }

    if (lowerText.indexOf('chatgpt') !== -1 || lowerText.indexOf('openai') !== -1 || lowerText.indexOf('gpt') !== -1) {
      return 'For ChatGPT or OpenAI-style integration, the safest pattern is a controlled backend or approved toolkit layer, clear prompt rules, rate limits, fallbacks, and human-governed releases. I can explain the setup, but I should not claim autonomous deployment or self-healing code.';
    }

    if (lowerText.indexOf('aws') !== -1 || lowerText.indexOf('amazon') !== -1 || lowerText.indexOf('s3') !== -1 || lowerText.indexOf('cloudfront') !== -1 || lowerText.indexOf('bucket') !== -1) {
      return 'IVX uses AWS services such as S3 and CloudFront for storage and delivery. The main checks are bucket permissions, object paths, cache invalidation, and origin configuration. I can help triage the likely issue, but production changes still need human review.';
    }

    if (lowerText.indexOf('backend') !== -1 || lowerText.indexOf('supabase') !== -1 || lowerText.indexOf('api') !== -1 || lowerText.indexOf('server') !== -1 || lowerText.indexOf('database') !== -1 || lowerText.indexOf('auth') !== -1) {
      return 'IVX backend workflows rely on Supabase for auth, data, and support flows. The first checks are auth state, access rules, function execution, request payloads, and database writes. I can help narrow the likely failure point and the next safe step.';
    }

    if (lowerText.indexOf('frontend') !== -1 || lowerText.indexOf('app issue') !== -1 || lowerText.indexOf('screen') !== -1 || lowerText.indexOf('expo') !== -1 || lowerText.indexOf('react native') !== -1 || lowerText.indexOf('landing page') !== -1 || lowerText.indexOf('keyboard') !== -1) {
      return 'IVX uses shared Expo and React Native frontend flows across the app and landing page. The usual checks are route state, screen-level errors, keyboard and safe-area layout, web compatibility, and API response handling. I can help narrow the issue and suggest the next implementation step.';
    }

    if (lowerText.indexOf('technical') !== -1 || lowerText.indexOf('code') !== -1 || lowerText.indexOf('bug') !== -1 || lowerText.indexOf('crash') !== -1 || lowerText.indexOf('incident') !== -1) {
      return 'IVX uses a shared app and landing support flow, backend support workflows, AWS-backed delivery layers, and an AI support layer. I can explain the setup and help triage a technical question, but production fixes and releases still need human review.';
    }

    if (lowerText.indexOf('fix automatically') !== -1 || lowerText.indexOf('fix itself') !== -1 || lowerText.indexOf('autonomous') !== -1 || lowerText.indexOf('no human') !== -1 || lowerText.indexOf('full control') !== -1) {
      return 'AI can help answer questions, draft code, explain architecture, and support technical triage. It should not be presented as having full autonomous control over production fixes, releases, or infrastructure without human review.';
    }

    if (lowerText.indexOf('ai') !== -1 || lowerText.indexOf('assistant') !== -1) {
      return 'The AI chat can answer investor, product, and technical-support questions, including frontend, backend, AWS, and integration topics. It can guide and triage, but it should not claim that production code was changed automatically without human approval.';
    }

    if (lowerText.indexOf('risk') !== -1 || lowerText.indexOf('safe') !== -1 || lowerText.indexOf('guarantee') !== -1 || lowerText.indexOf('return') !== -1) {
      return 'All investments involve risk, including partial or total loss of capital. Projected ROI, fees, liquidity, and exit timing vary by deal, and returns are not guaranteed.';
    }

    if (lowerText.indexOf('dividend') !== -1 || lowerText.indexOf('distribution') !== -1) {
      return 'Distribution timing depends on the specific offering and its documents. Review each opportunity’s terms because distributions, expenses, and timelines can change based on project performance.';
    }

    return 'I can help with investor intake, live opportunities, member readiness, platform support, technical triage, AWS and backend questions, and public risk disclosures. If you need direct follow-up from the IVX team, use the live support request below.';
  }

  async function requestAiResponse(userText) {
    var client = getClient();

    if (client && client.functions && typeof client.functions.invoke === 'function') {
      try {
        var result = await client.functions.invoke('ai-generate', {
          body: {
            prompt: buildPrompt(userText, buildConversationSummary()),
            type: 'text'
          }
        });
        var responseText = result && result.data ? (result.data.text || result.data.result || '') : '';

        if (responseText) {
          console.log('[IVX Landing Chat] AI response loaded from edge function');
          return responseText;
        }

        if (result && result.error) {
          console.warn('[IVX Landing Chat] Edge function returned error:', result.error.message || result.error);
        }
      } catch (error) {
        console.warn('[IVX Landing Chat] Edge function request failed:', error && error.message ? error.message : error);
      }
    }

    return buildFallback(userText);
  }

  async function handleSend() {
    if (state.busy) {
      return;
    }

    var elements = getElements();
    if (!elements.input) {
      return;
    }

    var userText = elements.input.value.trim();
    if (!userText) {
      return;
    }

    appendMessage('user', userText);
    elements.input.value = '';
    state.busy = true;
    updateBusyState();
    setStatus('IVX AI is responding', 'Reviewing allocations, technical support, and member access now.', 'waiting');

    try {
      var reply = await requestAiResponse(userText);
      appendMessage('support', reply);
      setStatus('IVX AI ready', 'Ask about allocations, support, AWS, ChatGPT, or risk disclosures.', 'connected');

      if (typeof window.fireAdEvent === 'function') {
        window.fireAdEvent('contact', {
          content_name: 'Landing Investor Chat Message',
          value: 0,
          category: 'engagement'
        });
      }
    } catch (error) {
      console.warn('[IVX Landing Chat] Send flow failed:', error && error.message ? error.message : error);
      appendMessage('support', buildFallback(userText));
      setStatus('Investor chat fallback active', 'Live support is still available below.', 'warning');
    } finally {
      state.busy = false;
      updateBusyState();
    }
  }

  function classifySupportCategory(transcript) {
    var lowerText = String(transcript || '').toLowerCase();

    if (lowerText.indexOf('technical') !== -1 || lowerText.indexOf('frontend') !== -1 || lowerText.indexOf('backend') !== -1 || lowerText.indexOf('supabase') !== -1 || lowerText.indexOf('aws') !== -1 || lowerText.indexOf('amazon') !== -1 || lowerText.indexOf('s3') !== -1 || lowerText.indexOf('cloudfront') !== -1 || lowerText.indexOf('chatgpt') !== -1 || lowerText.indexOf('openai') !== -1 || lowerText.indexOf('bug') !== -1 || lowerText.indexOf('crash') !== -1 || lowerText.indexOf('error') !== -1) {
      return 'technical';
    }

    return 'general';
  }

  function classifySupportPriority(transcript) {
    var lowerText = String(transcript || '').toLowerCase();

    if (lowerText.indexOf('security') !== -1 || lowerText.indexOf('funds') !== -1 || lowerText.indexOf('outage') !== -1 || lowerText.indexOf('production down') !== -1 || lowerText.indexOf('urgent') !== -1 || lowerText.indexOf('crash') !== -1) {
      return 'high';
    }

    return classifySupportCategory(transcript) === 'technical' ? 'medium' : 'low';
  }

  async function handleRequestHuman() {
    if (state.busy) {
      return;
    }

    state.busy = true;
    updateBusyState();
    setStatus('Submitting live support request', 'Preparing an investor relations follow-up.', 'waiting');

    var transcript = state.messages
      .filter(function (message) { return message.role === 'user'; })
      .slice(-5)
      .map(function (message) { return message.text; })
      .join(' | ')
      .trim();

    var category = classifySupportCategory(transcript);
    var priority = classifySupportPriority(transcript);
    var subjectPrefix = category === 'technical' ? 'Landing Technical Chat' : 'Landing Investor Chat';
    var subject = transcript.length > 10
      ? subjectPrefix + ': ' + transcript.slice(0, 80) + (transcript.length > 80 ? '…' : '')
      : subjectPrefix + ' Request';
    var message = transcript.length > 10
      ? 'Visitor requested ' + category + ' live support after discussing: ' + transcript.slice(0, 240)
      : 'Visitor requested live investor support from the public landing page.';
    var client = getClient();

    try {
      if (!client) {
        throw new Error('Supabase client unavailable');
      }

      var insertResult = await client
        .from('support_tickets')
        .insert({
          subject: subject,
          category: category,
          message: message,
          status: 'open',
          priority: priority,
          user_id: null
        })
        .select()
        .single();

      if (insertResult.error) {
        throw insertResult.error;
      }

      var ticketId = insertResult.data && insertResult.data.id ? String(insertResult.data.id) : 'pending';
      appendMessage('support', 'Your live investor support request is in. Ticket #' + ticketId.slice(-6) + '. The IVX team will follow up through investor relations. You can also email investors@ivxholding.com or call +1 (561) 644-3503 if you want immediate contact.');
      setStatus('Live support requested', 'Investor relations will follow up from the public queue.', 'connected');

      if (typeof window.fireAdEvent === 'function') {
        window.fireAdEvent('lead', {
          content_name: 'Landing Live Support Request',
          value: 0,
          category: 'support'
        });
      }
    } catch (error) {
      console.warn('[IVX Landing Chat] Live support request failed:', error && error.message ? error.message : error);
      appendMessage('support', 'We could not create the live support ticket automatically right now. Please email investors@ivxholding.com or call +1 (561) 644-3503 and mention that you requested investor chat support on the landing page.');
      setStatus('Direct investor contact recommended', 'Email or call IVX investor relations now.', 'warning');
    } finally {
      state.busy = false;
      updateBusyState();
    }
  }

  function handleQuickReply(event) {
    var reply = event.currentTarget.getAttribute('data-reply') || '';
    var elements = getElements();
    if (!elements.input) {
      return;
    }

    elements.input.value = reply;
    elements.input.focus();
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  function init() {
    if (state.initialized) {
      return;
    }

    var elements = getElements();
    if (!elements.shell || !elements.messages || !elements.input || !elements.send || !elements.human) {
      return;
    }

    state.initialized = true;
    state.messages = [
      buildMessage('support', 'Hello! Welcome to IVX investor support. Ask about live opportunities, member readiness, frontend or backend support, AWS operations, ChatGPT integration, management diligence, or the intake on this page.')
    ];

    renderMessages();
    updateBusyState();
    setStatus('IVX AI ready', 'Ask about allocations, support, AWS, ChatGPT, or risk disclosures.', 'connected');

    elements.send.addEventListener('click', function () {
      void handleSend();
    });
    elements.human.addEventListener('click', function () {
      void handleRequestHuman();
    });
    elements.input.addEventListener('keydown', handleKeyDown);

    Array.prototype.forEach.call(elements.quickReplyButtons, function (button, index) {
      if (!button.textContent) {
        button.textContent = QUICK_REPLIES[index] || 'Ask IVX';
      }
      button.addEventListener('click', handleQuickReply);
    });

    console.log('[IVX Landing Chat] Initialized');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
