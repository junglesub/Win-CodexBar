// junglesub/Win-CodexBar (Personal Fork) Landing Page App Logic

document.addEventListener('DOMContentLoaded', () => {
  initI18n();
  initCopyButtons();
  initProvidersGrid();
});

/* ── 1. Bilingual Translation Engine (KO / EN) ── */
const i18nDict = {
  ko: {
    "nav.features": "핵심 기능",
    "nav.showcase": "스크린샷",
    "nav.providers": "지원 프로바이더 (56+)",
    "hero.badge": "junglesub/Win-CodexBar Personal Fork v2026.08",
    "hero.title_p1": "Windows 작업표시줄 위에 뜨는",
    "hero.title_p2": "AI 코딩 쿼터 실시간 나침반",
    "hero.subtitle": "5시간 · 주간 · 월간 사용률을 한눈에. Claude, Codex, Gemini, Antigravity, DeepSeek 등 56개 AI 코딩 도구의 실시간 한도를 항상 떠 있는 글래스 오버레이로 확인하세요.",
    "hero.copy": "복사하기",
    "hero.download_exe": "Setup.exe 다운로드",
    "hero.download_portable": "Portable 무설치 버전",
    "feat.tag": "FORK SUPERPOWERS",
    "feat.title": "Personal Fork 핵심 기능",
    "feat.desc": "모호한 추정치 대신 실제 프로바이더 쿼터 윈도우를 정밀하게 분류하여 보여줍니다.",
    "feat.f1_title": "5h / Weekly / Monthly 쿼터",
    "feat.f1_desc": "5시간 · 주간 · 월간 3개 고정 슬롯으로 실제 소비한 쿼터 퍼센트를 명확히 표시합니다.",
    "feat.f2_title": "독립 메트릭 톤 컬러",
    "feat.f2_desc": "임계치에 도달한 특정 슬롯만 주황(75% 경고) 또는 빨강(90% 위험)으로 개별 착색됩니다.",
    "feat.f3_title": "인라인 리셋 카운트다운",
    "feat.f3_desc": "퍼센트 옆에 가장 큰 단위 1개로 초기화 남은 시간을 표시합니다.",
    "feat.f4_title": "Antigravity Quota 연동",
    "feat.f4_desc": "Gemini 공유 풀의 5시간 및 주간 쿼터 버킷을 Quota Summary로 안정적 추출합니다.",
    "feat.f5_title": "스마트 모델 폴백",
    "feat.f5_desc": "주기 구분이 없는 프로바이더는 modelSpecific 등 유효한 메트릭을 자동 표시합니다.",
    "feat.f6_title": "자동 롤링 릴리스 & 설치",
    "feat.f6_desc": "GitHub Actions 자동 빌드와 SHA-256 검증 PowerShell 1줄 자동 설치를 지원합니다.",
    "show.tag": "FLOAT BAR OVERLAY",
    "show.title": "작업표시줄 위 Float Bar 실제 구동 화면",
    "show.desc": "Windows 작업표시줄 위에 항상 떠 있는 글래스 필(Glass Pill) 오버레이로 5시간/주간/월간 실시간 쿼터를 확인하세요.",
    "prov.tag": "SUPPORTED TOOLS",
    "prov.title": "56+ AI 코딩 프로바이더 지원",
    "prov.desc": "시중의 거의 모든 AI 코딩 어시스턴트와 LLM 클라우드 사용량을 손쉽게 모니터링할 수 있습니다.",
    "prov.search_ph": "프로바이더 검색 (예: Claude, Codex, Gemini, Antigravity, DeepSeek...)"
  },
  en: {
    "nav.features": "Features",
    "nav.showcase": "Screenshots",
    "nav.providers": "Providers (56+)",
    "hero.badge": "junglesub/Win-CodexBar Personal Fork v2026.08",
    "hero.title_p1": "Floating on your Windows Taskbar",
    "hero.title_p2": "Real-Time AI Quota Compass",
    "hero.subtitle": "5h · Weekly · Monthly quota at a glance. Track live limits for 56+ AI coding tools including Claude, Codex, Gemini, Antigravity, and DeepSeek via an always-on-top glass overlay.",
    "hero.copy": "Copy",
    "hero.download_exe": "Download Setup.exe",
    "hero.download_portable": "Portable Executable",
    "feat.tag": "FORK SUPERPOWERS",
    "feat.title": "Personal Fork Key Features",
    "feat.desc": "Authentic, duration-matched quota windows instead of ambiguous single estimates.",
    "feat.f1_title": "5h / Weekly / Monthly Quota",
    "feat.f1_desc": "Fixed 3-window slots showing consumed quota percentages clearly.",
    "feat.f2_title": "Independent Metric Colors",
    "feat.f2_desc": "Only the exhausted quota metric turns amber (75% warn) or red (90% crit).",
    "feat.f3_title": "Inline Reset Timers",
    "feat.f3_desc": "Displays live reset countdowns (e.g. 30m, 1h, 1d) directly beside usage.",
    "feat.f4_title": "Antigravity Quota Summary",
    "feat.f4_desc": "Extracts 5h & weekly Gemini shared pool buckets via Quota Summary endpoint.",
    "feat.f5_title": "Smart Metric Fallback",
    "feat.f5_desc": "Automatically renders labeled model-specific metrics for uncadenced providers.",
    "feat.f6_title": "Rolling Release & 1-Line Install",
    "feat.f6_desc": "Automated GitHub Actions builds and SHA-256 verified 1-line PowerShell installer.",
    "show.tag": "FLOAT BAR OVERLAY",
    "show.title": "Float Bar Live Overlay on Taskbar",
    "show.desc": "Monitor 5-hour, weekly, and monthly AI quotas with a compact, always-on-top glass pill overlay on your Windows taskbar.",
    "prov.tag": "SUPPORTED TOOLS",
    "prov.title": "56+ AI Coding Providers Supported",
    "prov.desc": "Effortlessly monitor usage and quotas across virtually every AI coding assistant and LLM cloud service.",
    "prov.search_ph": "Search providers (e.g. Claude, Codex, Gemini, Antigravity, DeepSeek...)"
  }
};

let currentLang = localStorage.getItem('win_codexbar_lang') || 'ko';

function initI18n() {
  const langToggleBtn = document.getElementById('langToggleBtn');

  applyLanguage(currentLang);

  langToggleBtn.addEventListener('click', () => {
    currentLang = currentLang === 'ko' ? 'en' : 'ko';
    localStorage.setItem('win_codexbar_lang', currentLang);
    applyLanguage(currentLang);
  });
}

function applyLanguage(lang) {
  const dict = i18nDict[lang] || i18nDict.ko;
  
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) {
      el.textContent = dict[key];
    }
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (dict[key]) {
      el.setAttribute('placeholder', dict[key]);
    }
  });

  const langText = document.getElementById('langText');
  if (langText) {
    langText.textContent = lang === 'ko' ? 'English' : '한국어';
  }
  document.documentElement.lang = lang;
}

/* ── 2. 1-Click Clipboard Copying ── */
function initCopyButtons() {
  const copyInstallBtn = document.getElementById('copyInstallBtn');
  const installCmd = document.getElementById('installCmd');

  if (copyInstallBtn && installCmd) {
    copyInstallBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(installCmd.textContent.trim()).then(() => {
        copyInstallBtn.classList.add('copied');
        const icon = document.getElementById('copyIcon');
        const text = document.getElementById('copyBtnText');
        icon.textContent = '✅';
        text.textContent = currentLang === 'ko' ? '복사 완료! 🚀' : 'Copied! 🚀';

        setTimeout(() => {
          copyInstallBtn.classList.remove('copied');
          icon.textContent = '📋';
          text.textContent = currentLang === 'ko' ? '복사하기' : 'Copy';
        }, 2500);
      });
    });
  }
}

/* ── 3. Supported 56+ AI Providers Cloud & Search ── */
const providerList = [
  { name: 'Claude', icon: 'ProviderIcon-claude.svg' },
  { name: 'Codex', icon: 'ProviderIcon-codex.svg' },
  { name: 'Antigravity', icon: 'ProviderIcon-antigravity.svg' },
  { name: 'Gemini', icon: 'ProviderIcon-gemini.svg' },
  { name: 'Copilot', icon: 'ProviderIcon-copilot.svg' },
  { name: 'Cursor', icon: 'ProviderIcon-cursor.svg' },
  { name: 'DeepSeek', icon: 'ProviderIcon-deepseek.svg' },
  { name: 'OpenRouter', icon: 'ProviderIcon-openrouter.svg' },
  { name: 'Groq', icon: 'ProviderIcon-groq.svg' },
  { name: 'Grok / xAI', icon: 'ProviderIcon-grok.svg' },
  { name: 'MiniMax', icon: 'ProviderIcon-minimax.svg' },
  { name: 'Kiro', icon: 'ProviderIcon-kiro.svg' },
  { name: 'Mistral', icon: 'ProviderIcon-mistral.svg' },
  { name: 'Ollama', icon: 'ProviderIcon-ollama.svg' },
  { name: 'Qoder', icon: 'ProviderIcon-qoder.svg' },
  { name: 'Sakana AI', icon: 'ProviderIcon-sakana.svg' },
  { name: 'Windsurf', icon: 'ProviderIcon-windsurf.svg' },
  { name: 'Perplexity', icon: 'ProviderIcon-perplexity.svg' },
  { name: 'Poe', icon: 'ProviderIcon-poe.svg' },
  { name: 'Kimi', icon: 'ProviderIcon-kimi.svg' },
  { name: 'Kilo', icon: 'ProviderIcon-kilo.svg' },
  { name: 'Manus', icon: 'ProviderIcon-manus.svg' },
  { name: 'Devin', icon: 'ProviderIcon-devin.svg' },
  { name: 'Zed', icon: 'ProviderIcon-zed.svg' },
  { name: 'Warp', icon: 'ProviderIcon-warp.svg' },
  { name: 'Zai', icon: 'ProviderIcon-zai.svg' },
  { name: 'Venice', icon: 'ProviderIcon-venice.svg' },
  { name: 'Vertex AI', icon: 'ProviderIcon-vertexai.svg' },
  { name: 'Bedrock', icon: 'ProviderIcon-bedrock.svg' },
  { name: 'Alibaba Cloud', icon: 'ProviderIcon-alibaba.svg' },
  { name: 'Qwen', icon: 'ProviderIcon-qwencloud.svg' },
  { name: 'Doubao', icon: 'ProviderIcon-doubao.svg' },
  { name: 'StepFun', icon: 'ProviderIcon-stepfun.svg' },
  { name: 'DeepInfra', icon: 'ProviderIcon-deepinfra.svg' },
  { name: 'Deepgram', icon: 'ProviderIcon-deepgram.svg' },
  { name: 'ElevenLabs', icon: 'ProviderIcon-elevenlabs.svg' },
  { name: 'LiteLLM', icon: 'ProviderIcon-litellm.svg' },
  { name: 'OpenCode', icon: 'ProviderIcon-opencode.svg' },
  { name: 'Codebuff', icon: 'ProviderIcon-codebuff.svg' },
  { name: 'CommandCode', icon: 'ProviderIcon-commandcode.svg' },
  { name: 'Augment', icon: 'ProviderIcon-augment.svg' },
  { name: 'Abacus AI', icon: 'ProviderIcon-abacus.svg' },
  { name: 'Factory', icon: 'ProviderIcon-factory.svg' },
  { name: 'Notion AI', icon: 'ProviderIcon-notion.svg' },
  { name: 'Chutes', icon: 'ProviderIcon-chutes.svg' },
  { name: 'T3 Chat', icon: 'ProviderIcon-t3chat.svg' },
  { name: 'ZenMux', icon: 'ProviderIcon-zenmux.svg' },
  { name: 'Sub2API', icon: 'ProviderIcon-sub2api.svg' },
  { name: 'LLM Proxy', icon: 'ProviderIcon-llmproxy.svg' },
  { name: 'Mimo', icon: 'ProviderIcon-mimo.svg' },
  { name: 'LongCat', icon: 'ProviderIcon-longcat.svg' },
  { name: 'AI&', icon: 'ProviderIcon-aiand.svg' },
  { name: 'Amp', icon: 'ProviderIcon-amp.svg' },
  { name: 'Crof', icon: 'ProviderIcon-crof.svg' },
  { name: 'Wayfinder', icon: 'ProviderIcon-wayfinder.svg' },
  { name: 'ZoomMate', icon: 'ProviderIcon-zoommate.svg' }
];

function initProvidersGrid() {
  const grid = document.getElementById('providersGrid');
  const searchInput = document.getElementById('providerSearchInput');

  function render(filter = '') {
    const normalized = filter.toLowerCase().trim();
    grid.innerHTML = '';

    const filtered = providerList.filter(p => p.name.toLowerCase().includes(normalized));

    if (filtered.length === 0) {
      grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 24px;">No matching providers found</div>`;
      return;
    }

    filtered.forEach(p => {
      const chip = document.createElement('div');
      chip.className = 'provider-chip';
      chip.innerHTML = `
        <img src="assets/icons/${p.icon}" alt="${p.name}" onerror="this.src='assets/icons/ProviderIcon-claude.svg'">
        <span>${p.name}</span>
      `;
      grid.appendChild(chip);
    });
  }

  render();

  searchInput.addEventListener('input', (e) => {
    render(e.target.value);
  });
}
