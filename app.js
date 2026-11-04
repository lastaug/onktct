/**
 * ỨNG DỤNG ÔN THI TRẮC NGHIỆM KINH TẾ CHÍNH TRỊ MÁC - LÊNIN (MVP)
 * Căn cứ: Giáo trình Bộ Giáo dục và Đào tạo (2021)
 * Tuân thủ UI/UX Designer Skill: WCAG 2.1 AAA/AA, iOS HIG Touch Targets, Zero CDN, Offline First
 */

(function () {
  'use strict';

  // 1. DATA SOURCE VALIDATION
  if (!window.QUESTION_BANK || !window.QUESTION_BANK.questions) {
    console.error('Lỗi: Chưa nạp được window.QUESTION_BANK! Vui lòng kiểm tra data.js.');
    return;
  }

  const allQuestions = window.QUESTION_BANK.questions;
  const testableQuestions = allQuestions.filter(q => q.is_testable === true);
  const flashcardQuestions = allQuestions.filter(q => q.source_label === 'AZ' || !q.is_testable);

  console.log(`Đã nạp ${allQuestions.length} câu hỏi (${testableQuestions.length} trắc nghiệm thi, ${flashcardQuestions.length} flashcard).`);

  // 2. DEFENSIVE STORAGE ADAPTER (FALLBACK TO MEMORY ON FILE:/// RESTRICTION)
  const StorageAdapter = (function () {
    let memory = {};
    let canUseLocalStorage = false;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const testKey = '__test_ktct__';
        window.localStorage.setItem(testKey, '1');
        window.localStorage.removeItem(testKey);
        canUseLocalStorage = true;
      }
    } catch (e) {
      console.warn('localStorage không khả dụng hoặc bị chặn dưới file:///. Tự động chuyển sang bộ nhớ tạm thời.', e);
      canUseLocalStorage = false;
    }

    return {
      getItem: function (key) {
        if (canUseLocalStorage) {
          try { return window.localStorage.getItem(key); } catch (e) { }
        }
        return memory[key] || null;
      },
      setItem: function (key, val) {
        if (canUseLocalStorage) {
          try { window.localStorage.setItem(key, val); } catch (e) { }
        }
        memory[key] = val;
      },
      removeItem: function (key) {
        if (canUseLocalStorage) {
          try { window.localStorage.removeItem(key); } catch (e) { }
        }
        delete memory[key];
      }
    };
  })();

  const STORAGE_KEY = 'ktct_exam_progress_v3';
  let state = {
    userAnswers: {},     // { [qid]: { selected: 'A', isCorrect: true, timestamp: Date.now() } }
    mistakeIds: [],      // Array of qids
    examHistory: [],     // Array of exam results
  };

  function loadState() {
    try {
      const saved = StorageAdapter.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        state.userAnswers = parsed.userAnswers || {};
        state.mistakeIds = parsed.mistakeIds || [];
        state.examHistory = parsed.examHistory || [];
      }
    } catch (e) {
      console.warn('Lỗi phân tích state:', e);
    }
  }

  function saveState() {
    try {
      StorageAdapter.setItem(STORAGE_KEY, JSON.stringify(state));
      const statusEl = document.getElementById('storage-status');
      if (statusEl) {
        statusEl.innerText = 'Đã lưu tự động';
      }
    } catch (e) {
      console.warn('Lỗi ghi state:', e);
    }
  }

  loadState();

  // 3. CHAPTER DEFINITIONS
  const CHAPTERS = [
    { id: 1, title: 'Chương 1: Đối tượng, phương pháp và chức năng của KTCT', pages: 'tr. 8 - 28' },
    { id: 2, title: 'Chương 2: Hàng hóa, thị trường và vai trò của các chủ thể', pages: 'tr. 29 - 74' },
    { id: 3, title: 'Chương 3: Giá trị thặng dư trong nền kinh tế thị trường', pages: 'tr. 75 - 111' },
    { id: 4, title: 'Chương 4: Cạnh tranh và độc quyền trong nền KTTT', pages: 'tr. 112 - 151' },
    { id: 5, title: 'Chương 5: Kinh tế thị trường định hướng XHCN & Quan hệ lợi ích', pages: 'tr. 152 - 200' },
    { id: 6, title: 'Chương 6: Công nghiệp hóa, hiện đại hóa & Hội nhập kinh tế', pages: 'tr. 201 - 257' }
  ];

  // 4. NAVIGATION CONTROLLER (SYNC DESKTOP SIDEBAR & MOBILE/IPAD BOTTOM BAR)
  const navLinks = document.querySelectorAll('.nav-link');
  const bottomNavItems = document.querySelectorAll('.bottom-nav-item');
  const pageSections = document.querySelectorAll('.page-section');
  const pageTitleEl = document.getElementById('current-page-title');
  const sidebar = document.getElementById('sidebar');
  const mobileToggleBtn = document.getElementById('mobile-toggle-btn');

  const tabTitles = {
    'dashboard-section': 'Tổng quan học tập',
    'practice-chapter-section': 'Luyện tập theo chương',
    'practice-random-section': 'Luyện tập trắc nghiệm ngẫu nhiên',
    'mock-exam-section': 'Phòng Thi thử 60 phút',
    'mistakes-section': 'Sổ tay ôn tập câu sai',
    'flashcards-section': 'Tra cứu thuật ngữ & Flashcard A-Z'
  };

  function switchTab(targetId, customTitle) {
    const title = customTitle || tabTitles[targetId] || 'Ôn thi KTCT Mác - Lênin';

    // Sync Desktop Sidebar
    navLinks.forEach(link => {
      if (link.dataset.target === targetId) link.classList.add('active');
      else link.classList.remove('active');
    });

    // Sync Mobile Bottom Bar
    bottomNavItems.forEach(item => {
      if (item.dataset.target === targetId) item.classList.add('active');
      else item.classList.remove('active');
    });

    // Switch Visible Section
    pageSections.forEach(sec => {
      if (sec.id === targetId) sec.classList.add('active');
      else sec.classList.remove('active');
    });

    if (pageTitleEl) pageTitleEl.innerText = title;
    if (sidebar) sidebar.classList.remove('open');

    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Refresh Section Views
    if (targetId === 'dashboard-section') updateDashboard();
    if (targetId === 'practice-chapter-section') initChapterPractice();
    if (targetId === 'practice-random-section') initRandomPractice();
    if (targetId === 'mistakes-section') renderMistakesSection();
    if (targetId === 'flashcards-section') renderFlashcards();
  }

  // Attach Desktop Sidebar Events
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = link.dataset.target;
      switchTab(targetId);
    });
  });

  // Attach Bottom Nav Events (Touch-friendly)
  bottomNavItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = item.dataset.target;
      switchTab(targetId);
    });
  });

  // Mobile Menu Drawer Toggle
  if (mobileToggleBtn) {
    mobileToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('open');
    });
  }

  // Close sidebar on body tap if open on touch screen
  document.addEventListener('click', (e) => {
    if (sidebar && sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== mobileToggleBtn) {
      sidebar.classList.remove('open');
    }
  });

  // Quick CTA Links
  document.getElementById('banner-btn-practice')?.addEventListener('click', () => switchTab('practice-chapter-section'));
  document.getElementById('banner-btn-exam')?.addEventListener('click', () => switchTab('mock-exam-section'));
  document.getElementById('btn-quick-start-exam')?.addEventListener('click', () => switchTab('mock-exam-section'));

  // 5. DASHBOARD CONTROLLER
  function updateDashboard() {
    const totalQ = allQuestions.length;
    const answeredKeys = Object.keys(state.userAnswers);
    const answeredCount = answeredKeys.length;
    const correctCount = answeredKeys.filter(k => state.userAnswers[k].isCorrect).length;
    const wrongCount = answeredKeys.filter(k => !state.userAnswers[k].isCorrect).length;
    const accuracy = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;

    const elTotal = document.getElementById('stat-total-questions');
    const elAnswered = document.getElementById('stat-answered-count');
    const elWrong = document.getElementById('stat-wrong-count');
    const elAccuracy = document.getElementById('stat-accuracy');
    const elMistakeBadge = document.getElementById('badge-mistake-count');

    if (elTotal) elTotal.innerText = totalQ;
    if (elAnswered) elAnswered.innerText = answeredCount;
    if (elWrong) elWrong.innerText = wrongCount;
    if (elAccuracy) elAccuracy.innerText = `${accuracy}%`;
    if (elMistakeBadge) elMistakeBadge.innerText = state.mistakeIds.length;

    // Render Chapter Progress Cards
    const container = document.getElementById('dashboard-chapter-cards');
    if (!container) return;
    container.innerHTML = '';

    CHAPTERS.forEach(ch => {
      const chQuestions = testableQuestions.filter(q => q.chapter === ch.id);
      const chTotal = chQuestions.length;
      const chAnswered = chQuestions.filter(q => state.userAnswers[q.id]);
      const chCorrect = chAnswered.filter(q => state.userAnswers[q.id].isCorrect).length;
      const chPct = chTotal > 0 ? Math.round((chAnswered.length / chTotal) * 100) : 0;
      const chAcc = chAnswered.length > 0 ? Math.round((chCorrect / chAnswered.length) * 100) : 0;

      const card = document.createElement('div');
      card.className = 'chapter-card';
      card.innerHTML = `
        <div class="chapter-badge">Chương ${ch.id}</div>
        <div class="chapter-title">${ch.title}</div>
        <div class="chapter-meta">
          <span><strong>${chTotal}</strong> câu trắc nghiệm</span> &bull; 
          <span>${ch.pages}</span>
        </div>
        <div class="progress-container">
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: ${chPct}%;"></div>
          </div>
          <div class="progress-text">
            <span>Đã làm: ${chAnswered.length}/${chTotal} câu (${chPct}%)</span>
            <span style="color: ${chAcc >= 70 ? 'var(--color-success)' : 'var(--color-danger)'};">Đúng: ${chAcc}%</span>
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" style="margin-top:auto;" onclick="window.selectChapterForPractice(${ch.id})">
          Luyện tập ngay &rarr;
        </button>
      `;
      container.appendChild(card);
    });
  }

  window.selectChapterForPractice = function (chId) {
    practiceState.currentChapter = chId;
    practiceState.currentIndex = 0;
    switchTab('practice-chapter-section');
  };

  // 6. PRACTICE BY CHAPTER CONTROLLER
  let practiceState = {
    currentChapter: 1,
    questions: [],
    currentIndex: 0
  };

  function initChapterPractice() {
    const tabContainer = document.getElementById('chapter-tab-buttons');
    if (!tabContainer) return;
    tabContainer.innerHTML = '';

    CHAPTERS.forEach(ch => {
      const btn = document.createElement('button');
      btn.className = `btn ${ch.id === practiceState.currentChapter ? 'btn-primary' : 'btn-secondary'} btn-sm`;
      btn.style.whiteSpace = 'nowrap';
      btn.innerText = `Chương ${ch.id}`;
      btn.addEventListener('click', () => {
        practiceState.currentChapter = ch.id;
        practiceState.currentIndex = 0;
        initChapterPractice();
      });
      tabContainer.appendChild(btn);
    });

    // Filter questions
    practiceState.questions = testableQuestions.filter(q => q.chapter === practiceState.currentChapter);
    if (practiceState.questions.length === 0) {
      practiceState.questions = testableQuestions.slice(0, 10);
    }
    renderPracticeQuestion();
  }

  function renderPracticeQuestion() {
    const qList = practiceState.questions;
    if (qList.length === 0) return;

    if (practiceState.currentIndex < 0) practiceState.currentIndex = 0;
    if (practiceState.currentIndex >= qList.length) practiceState.currentIndex = qList.length - 1;

    const q = qList[practiceState.currentIndex];
    const total = qList.length;

    const elChBadge = document.getElementById('practice-chapter-badge');
    const elProg = document.getElementById('practice-progress-indicator');
    const elQCh = document.getElementById('q-chapter-tag');
    const elQId = document.getElementById('q-id-tag');
    const elQSource = document.getElementById('q-source-tag');
    const elQText = document.getElementById('practice-q-text');

    if (elChBadge) elChBadge.innerText = `Chương ${q.chapter || practiceState.currentChapter}`;
    if (elProg) elProg.innerText = `Câu ${practiceState.currentIndex + 1} / ${total}`;
    if (elQCh) elQCh.innerText = `Chương ${q.chapter}`;
    if (elQId) elQId.innerText = `Mã: ${q.id}`;
    if (elQSource) elQSource.innerText = `Vị trí: ${q.position || q.source_label}`;
    if (elQText) elQText.innerText = q.question;

    // Options Container
    const optsContainer = document.getElementById('practice-options-container');
    if (!optsContainer) return;
    optsContainer.innerHTML = '';

    const savedAnswer = state.userAnswers[q.id];
    const hasAnswered = !!savedAnswer;

    ['A', 'B', 'C', 'D'].forEach(letter => {
      if (!q.options || !q.options[letter]) return;
      const btn = document.createElement('button');
      btn.className = 'option-btn';

      let extraClass = '';
      if (hasAnswered) {
        if (letter === q.answer) {
          extraClass = 'correct';
        } else if (savedAnswer.selected === letter) {
          extraClass = 'incorrect';
        }
      }

      if (extraClass) btn.classList.add(extraClass);

      btn.innerHTML = `
        <span class="option-letter">${letter}</span>
        <span style="flex:1;">${q.options[letter]}</span>
      `;

      btn.addEventListener('click', () => {
        handlePracticeSelectOption(q, letter);
      });

      optsContainer.appendChild(btn);
    });

    // Explanation Box
    const explBox = document.getElementById('practice-explanation-box');
    if (explBox) {
      if (hasAnswered) {
        explBox.classList.add('show');
        const isCorrect = savedAnswer.isCorrect;
        const titleEl = document.getElementById('practice-explanation-title');
        const textEl = document.getElementById('practice-explanation-text');
        const distractorEl = document.getElementById('practice-option-distractors');
        const refEl = document.getElementById('practice-reference-pill');

        if (titleEl) {
          titleEl.innerHTML = isCorrect ?
            '<span style="color:var(--color-success); font-weight:700;">&#10004; Trả lời chính xác!</span>' :
            '<span style="color:var(--color-danger); font-weight:700;">&#10008; Chưa chính xác! Đáp án đúng là: ' + q.answer + '</span>';
        }

        if (textEl) {
          textEl.innerText = q.explanation || 'Đang cập nhật giải thích căn cứ...';
        }

        if (distractorEl) {
          if (q.option_explanations && q.option_explanations.distractors) {
            distractorEl.innerHTML = `<strong>Phân tích bẫy đề thi:</strong> ${q.option_explanations.distractors}`;
          } else {
            distractorEl.innerHTML = '';
          }
        }

        if (refEl) {
          refEl.innerText = `Căn cứ: Giáo trình 2021, Chương ${q.reference_chapter || q.chapter}, ${q.reference_section || ''}, ${q.reference_pages || ''}`;
        }
      } else {
        explBox.classList.remove('show');
      }
    }

    renderPracticeNavGrid();
  }

  function handlePracticeSelectOption(q, letter) {
    const isCorrect = (letter === q.answer);
    state.userAnswers[q.id] = {
      selected: letter,
      isCorrect: isCorrect,
      timestamp: Date.now()
    };

    if (!isCorrect) {
      if (!state.mistakeIds.includes(q.id)) {
        state.mistakeIds.push(q.id);
      }
    } else {
      state.mistakeIds = state.mistakeIds.filter(id => id !== q.id);
    }

    saveState();
    renderPracticeQuestion();
    updateDashboard();
  }

  function renderPracticeNavGrid() {
    const grid = document.getElementById('practice-question-grid');
    if (!grid) return;
    grid.innerHTML = '';

    practiceState.questions.forEach((q, idx) => {
      const btn = document.createElement('div');
      btn.className = 'grid-item';
      btn.innerText = idx + 1;

      if (idx === practiceState.currentIndex) {
        btn.classList.add('active');
      }

      const ans = state.userAnswers[q.id];
      if (ans) {
        if (ans.isCorrect) btn.classList.add('correct');
        else btn.classList.add('incorrect');
      }

      btn.addEventListener('click', () => {
        practiceState.currentIndex = idx;
        renderPracticeQuestion();
      });

      grid.appendChild(btn);
    });
  }

  document.getElementById('btn-practice-prev')?.addEventListener('click', () => {
    if (practiceState.currentIndex > 0) {
      practiceState.currentIndex--;
      renderPracticeQuestion();
    }
  });

  document.getElementById('btn-practice-next')?.addEventListener('click', () => {
    if (practiceState.currentIndex < practiceState.questions.length - 1) {
      practiceState.currentIndex++;
      renderPracticeQuestion();
    }
  });

  // 7. RANDOM PRACTICE CONTROLLER
  let randomState = {
    questions: [],
    currentIndex: 0
  };

  function initRandomPractice() {
    const countSelect = document.getElementById('select-random-count');
    const count = parseInt(countSelect ? countSelect.value : 20, 10);

    const shuffled = [...testableQuestions].sort(() => 0.5 - Math.random());
    randomState.questions = shuffled.slice(0, count);
    randomState.currentIndex = 0;
    renderRandomQuestion();
  }

  function renderRandomQuestion() {
    const qList = randomState.questions;
    if (qList.length === 0) return;

    if (randomState.currentIndex < 0) randomState.currentIndex = 0;
    if (randomState.currentIndex >= qList.length) randomState.currentIndex = qList.length - 1;

    const q = qList[randomState.currentIndex];
    const total = qList.length;

    const elCh = document.getElementById('random-q-chapter-tag');
    const elId = document.getElementById('random-q-id-tag');
    const elInd = document.getElementById('random-indicator');
    const elText = document.getElementById('random-q-text');

    if (elCh) elCh.innerText = `Chương ${q.chapter}`;
    if (elId) elId.innerText = q.id;
    if (elInd) elInd.innerText = `Câu ${randomState.currentIndex + 1} / ${total}`;
    if (elText) elText.innerText = q.question;

    const optsContainer = document.getElementById('random-options-container');
    if (!optsContainer) return;
    optsContainer.innerHTML = '';

    const savedAnswer = state.userAnswers[q.id];
    const hasAnswered = !!savedAnswer;

    ['A', 'B', 'C', 'D'].forEach(letter => {
      if (!q.options || !q.options[letter]) return;
      const btn = document.createElement('button');
      btn.className = 'option-btn';

      let extraClass = '';
      if (hasAnswered) {
        if (letter === q.answer) extraClass = 'correct';
        else if (savedAnswer.selected === letter) extraClass = 'incorrect';
      }
      if (extraClass) btn.classList.add(extraClass);

      btn.innerHTML = `
        <span class="option-letter">${letter}</span>
        <span style="flex:1;">${q.options[letter]}</span>
      `;

      btn.addEventListener('click', () => {
        handleRandomSelectOption(q, letter);
      });

      optsContainer.appendChild(btn);
    });

    const explBox = document.getElementById('random-explanation-box');
    if (explBox) {
      if (hasAnswered) {
        explBox.classList.add('show');
        const textEl = document.getElementById('random-explanation-text');
        const distractorEl = document.getElementById('random-option-distractors');
        const refEl = document.getElementById('random-reference-pill');

        if (textEl) textEl.innerText = q.explanation || 'Đang cập nhật...';
        if (distractorEl) {
          if (q.option_explanations && q.option_explanations.distractors) {
            distractorEl.innerHTML = `<strong>Phân tích bẫy:</strong> ${q.option_explanations.distractors}`;
          } else {
            distractorEl.innerHTML = '';
          }
        }
        if (refEl) {
          refEl.innerText = `Căn cứ: Chương ${q.reference_chapter || q.chapter}, ${q.reference_section || ''}, ${q.reference_pages || ''}`;
        }
      } else {
        explBox.classList.remove('show');
      }
    }

    renderRandomNavGrid();
  }

  function handleRandomSelectOption(q, letter) {
    const isCorrect = (letter === q.answer);
    state.userAnswers[q.id] = { selected: letter, isCorrect: isCorrect, timestamp: Date.now() };
    if (!isCorrect && !state.mistakeIds.includes(q.id)) state.mistakeIds.push(q.id);
    else if (isCorrect) state.mistakeIds = state.mistakeIds.filter(id => id !== q.id);

    saveState();
    renderRandomQuestion();
    updateDashboard();
  }

  function renderRandomNavGrid() {
    const grid = document.getElementById('random-question-grid');
    if (!grid) return;
    grid.innerHTML = '';

    randomState.questions.forEach((q, idx) => {
      const btn = document.createElement('div');
      btn.className = 'grid-item';
      btn.innerText = idx + 1;
      if (idx === randomState.currentIndex) btn.classList.add('active');

      const ans = state.userAnswers[q.id];
      if (ans) {
        if (ans.isCorrect) btn.classList.add('correct');
        else btn.classList.add('incorrect');
      }

      btn.addEventListener('click', () => {
        randomState.currentIndex = idx;
        renderRandomQuestion();
      });
      grid.appendChild(btn);
    });
  }

  document.getElementById('btn-generate-random')?.addEventListener('click', initRandomPractice);
  document.getElementById('btn-random-prev')?.addEventListener('click', () => {
    if (randomState.currentIndex > 0) { randomState.currentIndex--; renderRandomQuestion(); }
  });
  document.getElementById('btn-random-next')?.addEventListener('click', () => {
    if (randomState.currentIndex < randomState.questions.length - 1) { randomState.currentIndex++; renderRandomQuestion(); }
  });

  // 8. MOCK EXAM ENGINE (40 QUESTIONS - 60 MINUTES)
  let examState = {
    isActive: false,
    questions: [],
    userExamAnswers: {},
    flagged: {},
    currentIndex: 0,
    timeRemaining: 60 * 60,
    timerInterval: null,
    startTime: null
  };

  function buildExamQuestions() {
    const pickRandom = (arr, count) => {
      const s = [...arr].sort(() => 0.5 - Math.random());
      return s.slice(0, count);
    };

    const qCh1 = testableQuestions.filter(q => q.chapter === 1);
    const qCh2 = testableQuestions.filter(q => q.chapter === 2);
    const qCh3 = testableQuestions.filter(q => q.chapter === 3);
    const qCh4 = testableQuestions.filter(q => q.chapter === 4);
    const qCh5 = testableQuestions.filter(q => q.chapter === 5);
    const qCh6 = testableQuestions.filter(q => q.chapter === 6);

    const examList = [
      ...pickRandom(qCh1, 3),
      ...pickRandom(qCh2, 7),
      ...pickRandom(qCh3, 10), // Gồm cả bài tập tính toán
      ...pickRandom(qCh4, 6),
      ...pickRandom(qCh5, 7),
      ...pickRandom(qCh6, 7),
    ];

    if (examList.length < 40) {
      const remaining = testableQuestions.filter(q => !examList.some(e => e.id === q.id));
      examList.push(...pickRandom(remaining, 40 - examList.length));
    }

    return examList.slice(0, 40);
  }

  function startExam() {
    examState.questions = buildExamQuestions();
    examState.userExamAnswers = {};
    examState.flagged = {};
    examState.currentIndex = 0;
    examState.timeRemaining = 60 * 60;
    examState.isActive = true;
    examState.startTime = Date.now();

    document.getElementById('exam-start-card').style.display = 'none';
    document.getElementById('exam-result-view').style.display = 'none';
    document.getElementById('exam-active-arena').style.display = 'block';

    if (examState.timerInterval) clearInterval(examState.timerInterval);
    examState.timerInterval = setInterval(updateExamTimer, 1000);

    renderExamQuestion();
  }

  function updateExamTimer() {
    if (!examState.isActive) return;
    examState.timeRemaining--;

    const minutes = Math.floor(examState.timeRemaining / 60);
    const seconds = examState.timeRemaining % 60;
    const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    const timerEl = document.getElementById('exam-countdown-timer');
    if (timerEl) {
      timerEl.innerHTML = `
        <svg viewBox="0 0 24 24" style="width:20px; height:20px; fill:currentColor;"><path d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42C16.07 4.74 14.12 4 12 4c-4.97 0-9 4.03-9 9s4.02 9 9 9 9-4.03 9-9c0-2.12-.74-4.07-1.97-5.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>
        ${formatted}
      `;
      if (examState.timeRemaining <= 300) {
        timerEl.style.color = '#ef4444';
      } else {
        timerEl.style.color = 'var(--color-danger)';
      }
    }

    if (examState.timeRemaining <= 0) {
      clearInterval(examState.timerInterval);
      alert('Hết giờ làm bài! Hệ thống tự động thu bài thi.');
      submitExam();
    }
  }

  function renderExamQuestion() {
    if (!examState.isActive) return;
    const q = examState.questions[examState.currentIndex];
    const total = examState.questions.length;

    const elCh = document.getElementById('exam-q-chapter-tag');
    const elNum = document.getElementById('exam-q-num-tag');
    const elText = document.getElementById('exam-q-text');
    const elProg = document.getElementById('exam-progress-counter');

    if (elCh) elCh.innerText = `Chương ${q.chapter}`;
    if (elNum) elNum.innerText = `Câu ${examState.currentIndex + 1} / ${total}`;
    if (elText) elText.innerText = q.question;

    const answeredCount = Object.keys(examState.userExamAnswers).length;
    if (elProg) elProg.innerText = `Đã làm: ${answeredCount}/${total}`;

    const optsContainer = document.getElementById('exam-options-container');
    if (!optsContainer) return;
    optsContainer.innerHTML = '';

    const selectedOption = examState.userExamAnswers[examState.currentIndex];

    ['A', 'B', 'C', 'D'].forEach(letter => {
      if (!q.options || !q.options[letter]) return;
      const btn = document.createElement('button');
      btn.className = `option-btn ${selectedOption === letter ? 'selected' : ''}`;

      btn.innerHTML = `
        <span class="option-letter">${letter}</span>
        <span style="flex:1;">${q.options[letter]}</span>
      `;

      btn.addEventListener('click', () => {
        examState.userExamAnswers[examState.currentIndex] = letter;
        renderExamQuestion();
      });

      optsContainer.appendChild(btn);
    });

    renderExamNavGrid();
  }

  function renderExamNavGrid() {
    const grid = document.getElementById('exam-nav-grid');
    if (!grid) return;
    grid.innerHTML = '';

    examState.questions.forEach((q, idx) => {
      const btn = document.createElement('div');
      btn.className = 'grid-item';
      btn.innerText = idx + 1;

      if (idx === examState.currentIndex) btn.classList.add('active');
      if (examState.userExamAnswers[idx]) btn.classList.add('answered');
      if (examState.flagged[idx]) btn.classList.add('flagged');

      btn.addEventListener('click', () => {
        examState.currentIndex = idx;
        renderExamQuestion();
      });

      grid.appendChild(btn);
    });
  }

  function submitExam() {
    if (!confirm('Bạn có chắc chắn muốn nộp bài thi?')) return;

    examState.isActive = false;
    clearInterval(examState.timerInterval);

    let correctCount = 0;
    const reviewList = [];

    examState.questions.forEach((q, idx) => {
      const userChoice = examState.userExamAnswers[idx] || null;
      const isCorrect = (userChoice === q.answer);
      if (isCorrect) correctCount++;
      else {
        if (!state.mistakeIds.includes(q.id)) state.mistakeIds.push(q.id);
      }

      if (userChoice) {
        state.userAnswers[q.id] = { selected: userChoice, isCorrect: isCorrect, timestamp: Date.now() };
      }

      reviewList.push({
        question: q,
        index: idx + 1,
        userChoice: userChoice,
        isCorrect: isCorrect
      });
    });

    const totalScore = (correctCount * 0.25).toFixed(2);
    const accuracy = Math.round((correctCount / 40) * 100);
    const timeSpentSeconds = 3600 - examState.timeRemaining;
    const timeSpentMinutes = Math.max(1, Math.round(timeSpentSeconds / 60));

    state.examHistory.push({
      date: new Date().toISOString(),
      score: totalScore,
      correct: correctCount,
      total: 40,
      timeSpentMinutes: timeSpentMinutes
    });

    saveState();
    updateDashboard();

    document.getElementById('exam-active-arena').style.display = 'none';
    document.getElementById('exam-result-view').style.display = 'block';

    const elScore = document.getElementById('res-final-score');
    const elCorrect = document.getElementById('res-correct-count');
    const elWrong = document.getElementById('res-wrong-count');
    const elAcc = document.getElementById('res-accuracy-pct');
    const elTime = document.getElementById('res-time-spent');
    const elGrade = document.getElementById('res-grade-text');

    if (elScore) elScore.innerText = totalScore;
    if (elCorrect) elCorrect.innerText = correctCount;
    if (elWrong) elWrong.innerText = 40 - correctCount;
    if (elAcc) elAcc.innerText = `${accuracy}%`;
    if (elTime) elTime.innerText = `${timeSpentMinutes} phút`;

    if (elGrade) {
      if (totalScore >= 8.5) elGrade.innerText = 'Xuất sắc! (Điểm A) 🎉';
      else if (totalScore >= 7.0) elGrade.innerText = 'Khá giỏi! (Điểm B) 👏';
      else if (totalScore >= 5.5) elGrade.innerText = 'Đạt chuẩn (Điểm C) 👍';
      else elGrade.innerText = 'Cần ôn tập thêm (Dưới trung bình) ⚠️';
    }

    const reviewContainer = document.getElementById('exam-detailed-review-list');
    if (!reviewContainer) return;
    reviewContainer.innerHTML = '';

    reviewList.forEach(item => {
      const q = item.question;
      const card = document.createElement('div');
      card.className = 'question-card';
      card.style.borderLeft = item.isCorrect ? '5px solid var(--color-success)' : '5px solid var(--color-danger)';

      card.innerHTML = `
        <div class="question-meta-row">
          <span class="tag tag-chapter">Câu ${item.index} (Chương ${q.chapter})</span>
          <span class="tag" style="${item.isCorrect ? 'background:var(--color-success-surface); color:var(--color-success); border-color:var(--color-success-border);' : 'background:var(--color-danger-surface); color:var(--color-danger); border-color:var(--color-danger-border);'}">
            ${item.isCorrect ? '&#10004; Đúng' : '&#10008; Sai'}
          </span>
          <span class="tag">Mã: ${q.id}</span>
        </div>
        <div style="font-weight:700; font-size:1.05rem; margin-bottom:14px;">${q.question}</div>
        <div style="margin-bottom:12px; font-size:0.92rem;">
          <div><strong>Bạn chọn:</strong> <span style="font-weight:700; color:${item.isCorrect ? 'var(--color-success)' : 'var(--color-danger)'};">${item.userChoice || 'Chưa chọn'}</span></div>
          <div><strong>Đáp án đúng:</strong> <span style="font-weight:700; color:var(--color-success);">${q.answer}. ${q.options ? (q.options[q.answer] || '') : ''}</span></div>
        </div>
        <div style="background:#f8fafc; border-radius:var(--radius-md); padding:14px; font-size:0.9rem; line-height:1.6; border:1px solid var(--color-border-light);">
          <strong>Giải thích:</strong> ${q.explanation || 'Đang cập nhật...'}
          <div style="margin-top:8px;">
            <span class="reference-pill">Căn cứ: Chương ${q.reference_chapter || q.chapter}, ${q.reference_section || ''}, ${q.reference_pages || ''}</span>
          </div>
        </div>
      `;

      reviewContainer.appendChild(card);
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.getElementById('btn-start-exam-now')?.addEventListener('click', startExam);
  document.getElementById('btn-submit-exam')?.addEventListener('click', submitExam);
  document.getElementById('btn-retake-exam')?.addEventListener('click', () => {
    document.getElementById('exam-result-view').style.display = 'none';
    document.getElementById('exam-start-card').style.display = 'block';
  });

  document.getElementById('btn-exam-prev')?.addEventListener('click', () => {
    if (examState.currentIndex > 0) { examState.currentIndex--; renderExamQuestion(); }
  });
  document.getElementById('btn-exam-next')?.addEventListener('click', () => {
    if (examState.currentIndex < examState.questions.length - 1) { examState.currentIndex++; renderExamQuestion(); }
  });
  document.getElementById('btn-exam-flag')?.addEventListener('click', () => {
    examState.flagged[examState.currentIndex] = !examState.flagged[examState.currentIndex];
    renderExamQuestion();
  });

  // 9. MISTAKES REVIEW CONTROLLER
  function renderMistakesSection() {
    const container = document.getElementById('mistakes-cards-container');
    const summaryText = document.getElementById('mistakes-summary-text');
    const alertBox = document.getElementById('highest-error-chapter-alert');
    const alertText = document.getElementById('highest-error-chapter-text');

    const mIds = state.mistakeIds || [];
    if (summaryText) summaryText.innerText = `Bạn hiện có ${mIds.length} câu hỏi làm sai cần khắc phục.`;

    if (mIds.length === 0) {
      if (alertBox) alertBox.style.display = 'none';
      if (container) {
        container.innerHTML = `
          <div class="result-card" style="padding:48px 24px;">
            <div style="font-size:2.8rem; color:var(--color-success); margin-bottom:12px;">&#127881;</div>
            <h3 style="font-size:1.3rem; font-weight:700; margin-bottom:6px;">Tuyệt vời! Bạn không có câu sai nào</h3>
            <p style="color:var(--color-text-muted);">Hãy tiếp tục làm bài luyện tập theo chương hoặc thi thử để nâng cao điểm số.</p>
          </div>
        `;
      }
      return;
    }

    const errorByChapter = {};
    const mistakeQuestions = [];
    mIds.forEach(id => {
      const q = allQuestions.find(item => item.id === id);
      if (q) {
        mistakeQuestions.push(q);
        const ch = q.chapter || 'Khác';
        errorByChapter[ch] = (errorByChapter[ch] || 0) + 1;
      }
    });

    let maxCh = null;
    let maxCount = 0;
    for (const [ch, cnt] of Object.entries(errorByChapter)) {
      if (cnt > maxCount) {
        maxCount = cnt;
        maxCh = ch;
      }
    }

    if (alertBox && maxCh) {
      alertBox.style.display = 'block';
      if (alertText) alertText.innerText = `Chương bạn làm sai nhiều nhất là Chương ${maxCh} (${maxCount} câu). Bạn nên tập trung ôn lại chương này!`;
    }

    if (!container) return;
    container.innerHTML = '';
    mistakeQuestions.forEach(q => {
      const card = document.createElement('div');
      card.className = 'question-card';
      card.innerHTML = `
        <div class="question-meta-row">
          <span class="tag tag-chapter">Chương ${q.chapter}</span>
          <span class="tag tag-source">Mã: ${q.id}</span>
          <span class="tag" style="background:var(--color-danger-surface); color:var(--color-danger); border-color:var(--color-danger-border);">Cần ôn tập</span>
        </div>
        <div class="question-text">${q.question}</div>
        <div style="margin-bottom:14px;">
          <div><strong>Đáp án đúng:</strong> <span style="font-weight:700; color:var(--color-success);">${q.answer}. ${q.options ? (q.options[q.answer] || '') : ''}</span></div>
        </div>
        <div style="background:#f8fafc; border-radius:var(--radius-md); padding:14px; font-size:0.92rem; margin-bottom:14px; border:1px solid var(--color-border-light);">
          <strong>Giải thích:</strong> ${q.explanation || 'Đang cập nhật...'}
          <div style="margin-top:8px;">
            <span class="reference-pill">Căn cứ: Chương ${q.reference_chapter || q.chapter}, ${q.reference_section || ''}, ${q.reference_pages || ''}</span>
          </div>
        </div>
        <div style="display:flex; justify-content:flex-end;">
          <button class="btn btn-secondary btn-sm" onclick="window.removeMistakeItem('${q.id}')">
            &#10004; Đã nhớ (Xóa khỏi câu sai)
          </button>
        </div>
      `;
      container.appendChild(card);
    });
  }

  window.removeMistakeItem = function (qid) {
    state.mistakeIds = state.mistakeIds.filter(id => id !== qid);
    saveState();
    renderMistakesSection();
    updateDashboard();
  };

  document.getElementById('btn-clear-mistakes')?.addEventListener('click', () => {
    if (confirm('Bạn có chắc chắn muốn xóa toàn bộ danh sách câu sai?')) {
      state.mistakeIds = [];
      saveState();
      renderMistakesSection();
      updateDashboard();
    }
  });

  document.getElementById('btn-practice-all-mistakes')?.addEventListener('click', () => {
    const mistakeQuestions = allQuestions.filter(q => state.mistakeIds.includes(q.id) && q.is_testable);
    if (mistakeQuestions.length === 0) {
      alert('Không có câu hỏi trắc nghiệm nào trong danh sách câu sai.');
      return;
    }
    randomState.questions = mistakeQuestions;
    randomState.currentIndex = 0;
    switchTab('practice-random-section', 'Ôn tập lại các câu sai');
  });

  // 10. FLASHCARDS & LOOKUP CONTROLLER
  function renderFlashcards() {
    const container = document.getElementById('flashcards-list-container');
    const searchInput = document.getElementById('flashcard-search-input');
    const chapterFilter = document.getElementById('flashcard-chapter-filter');
    const countIndicator = document.getElementById('flashcard-count-indicator');

    if (!container) return;

    const searchTerm = (searchInput ? searchInput.value : '').toLowerCase().trim();
    const selectedCh = chapterFilter ? chapterFilter.value : 'all';

    const filtered = flashcardQuestions.filter(q => {
      const matchCh = (selectedCh === 'all') || (String(q.chapter) === selectedCh);
      const matchSearch = !searchTerm ||
        q.question.toLowerCase().includes(searchTerm) ||
        (q.answer && q.answer.toLowerCase().includes(searchTerm)) ||
        q.id.toLowerCase().includes(searchTerm);
      return matchCh && matchSearch;
    });

    if (countIndicator) {
      countIndicator.innerText = `Hiển thị ${filtered.length} / ${flashcardQuestions.length} thẻ kiến thức`;
    }

    container.innerHTML = '';
    if (filtered.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:32px; color:var(--color-text-muted);">Không tìm thấy thẻ kiến thức nào phù hợp.</div>';
      return;
    }

    filtered.slice(0, 100).forEach(q => {
      const card = document.createElement('div');
      card.style.background = '#ffffff';
      card.style.border = '1px solid var(--color-border)';
      card.style.borderRadius = 'var(--radius-md)';
      card.style.padding = '18px 20px';
      card.style.boxShadow = 'var(--shadow-sm)';

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span class="tag tag-chapter">Chương ${q.chapter}</span>
          <span style="font-size:0.75rem; color:var(--color-text-muted); font-weight:600;">Mã: ${q.id}</span>
        </div>
        <div style="font-weight:700; font-size:1.02rem; color:var(--color-text); margin-bottom:10px;">
          ${q.question}
        </div>
        <div style="background:var(--color-success-surface); border:1px solid var(--color-success-border); border-radius:var(--radius-sm); padding:10px 14px; margin-bottom:10px;">
          <strong style="color:var(--color-success);">&#10004; Trọng tâm:</strong>
          <span style="color:#14532d; font-weight:600; margin-left:4px;">${q.answer || 'Chưa cập nhật'}</span>
        </div>
        <div style="font-size:0.85rem; color:var(--color-text-muted);">
          <span class="reference-pill">Căn cứ: Chương ${q.reference_chapter || q.chapter}, ${q.reference_section || ''}, ${q.reference_pages || ''}</span>
        </div>
      `;

      container.appendChild(card);
    });

    if (filtered.length > 100) {
      const note = document.createElement('div');
      note.style.textAlign = 'center';
      note.style.padding = '12px';
      note.style.color = 'var(--color-text-muted)';
      note.innerText = `Đang hiển thị 100 thẻ đầu tiên. Hãy dùng thanh tìm kiếm để tra cứu cụ thể hơn.`;
      container.appendChild(note);
    }
  }

  document.getElementById('flashcard-search-input')?.addEventListener('input', renderFlashcards);
  document.getElementById('flashcard-chapter-filter')?.addEventListener('change', renderFlashcards);

  // 11. EXPORT & IMPORT DATA
  document.getElementById('btn-export-data')?.addEventListener('click', () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `ktct-tiendo-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  });

  document.getElementById('input-import-data')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (imported.userAnswers) {
          state = imported;
          saveState();
          updateDashboard();
          alert('Đã khôi phục tiến độ học tập thành công!');
        } else {
          alert('File dữ liệu không đúng định dạng!');
        }
      } catch (err) {
        alert('Lỗi đọc file: ' + err.message);
      }
    };
    reader.readAsText(file);
  });

  document.getElementById('btn-reset-data')?.addEventListener('click', () => {
    if (confirm('Bạn có chắc chắn muốn đặt lại toàn bộ tiến độ làm bài về 0?')) {
      state = { userAnswers: {}, mistakeIds: [], examHistory: [] };
      saveState();
      updateDashboard();
      alert('Đã đặt lại tiến độ thành công!');
    }
  });

  // INITIALIZE ON LOAD
  updateDashboard();
  console.log('Hệ thống Ôn thi KTCT Mác - Lênin MVP đã khởi tạo thành công!');

})();
