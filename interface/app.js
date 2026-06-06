const DATA_BASE = "../data_export";

const state = {
  questions: [],
  speakers: [],
  recordings: [],
  annotations: [],
  variants: [],
  facets: null,
  manifest: null,
  speakerById: new Map(),
  annotationByRecordingId: new Map(),
  variantByTextId: new Map(),
  questionByTextId: new Map(),
  filtered: [],
  selectedRecordingId: null,
  page: 1,
  pageSize: 25,
  activeTab: "search",
};

const els = {};

document.addEventListener("DOMContentLoaded", async () => {
  bindElements();
  bindEvents();
  try {
    await loadData();
    buildIndexes();
    populateControls();
    renderAll();
  } catch (error) {
    console.error(error);
    document.querySelector(".main-area").innerHTML = `
      <div class="view is-active">
        <div class="empty-state">
          <h2>資料載入失敗</h2>
          <p>請確認此頁是透過本機伺服器開啟，且 data_export JSON 檔案存在。</p>
        </div>
      </div>
    `;
  }
});

function bindElements() {
  [
    "statsStrip",
    "resetFiltersButton",
    "keywordInput",
    "questionSelect",
    "originSelect",
    "annotationStatusSelect",
    "targetSelect",
    "variantSelect",
    "runSearchButton",
    "pageSizeSelect",
    "recordingRows",
    "resultSummary",
    "pageLabel",
    "prevPageButton",
    "nextPageButton",
    "detailContent",
    "questionGrid",
    "compareLayout",
    "speakerGrid",
    "exportResultsButton",
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function bindEvents() {
  els.runSearchButton.addEventListener("click", () => {
    state.page = 1;
    applyFilters();
  });

  [
    els.keywordInput,
    els.questionSelect,
    els.originSelect,
    els.annotationStatusSelect,
    els.targetSelect,
    els.variantSelect,
  ].forEach((control) => {
    control.addEventListener("change", () => {
      if (control === els.questionSelect) {
        populateTargetControls();
      } else if (control === els.targetSelect) {
        populateVariantOptions();
      }
      state.page = 1;
      applyFilters();
    });
  });

  els.keywordInput.addEventListener("input", debounce(() => {
    state.page = 1;
    applyFilters();
  }, 180));

  document.querySelectorAll('input[name="matchMode"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      state.page = 1;
      applyFilters();
    });
  });

  els.resetFiltersButton.addEventListener("click", resetFilters);
  els.pageSizeSelect.addEventListener("change", () => {
    state.pageSize = Number(els.pageSizeSelect.value);
    state.page = 1;
    renderRecordings();
  });
  els.prevPageButton.addEventListener("click", () => {
    if (state.page > 1) {
      state.page -= 1;
      renderRecordings();
    }
  });
  els.nextPageButton.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
    if (state.page < totalPages) {
      state.page += 1;
      renderRecordings();
    }
  });
  els.exportResultsButton.addEventListener("click", exportCurrentResults);

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });
}

async function loadData() {
  const names = [
    "manifest",
    "questions",
    "speakers",
    "recordings",
    "annotations",
    "variants",
    "facets",
  ];
  const values = await Promise.all(
    names.map((name) => fetch(`${DATA_BASE}/${name}.json`).then((res) => {
      if (!res.ok) throw new Error(`${name}.json 載入失敗`);
      return res.json();
    }))
  );
  names.forEach((name, index) => {
    state[name] = values[index];
  });
}

function buildIndexes() {
  state.speakers.forEach((speaker) => state.speakerById.set(speaker.speakerId, speaker));
  state.questions.forEach((question) => state.questionByTextId.set(question.textId, question));
  state.annotations.forEach((annotation) => {
    state.annotationByRecordingId.set(annotation.recordingId, annotation);
  });
  state.variants.forEach((variant) => state.variantByTextId.set(variant.textId, variant));
  state.filtered = [...state.recordings];
}

function populateControls() {
  setOptions(els.questionSelect, [
    ["", "全部題號"],
    ...state.questions.map((q) => [String(q.textId), `第 ${q.questionNumber} 題`]),
  ]);

  setOptions(els.originSelect, [
    ["", "全部來源地"],
    ...state.facets.speakerOrigins.map((item) => [item.value, `${item.value} (${item.count})`]),
  ]);

  populateTargetControls();
}

function populateTargetControls() {
  const selectedTextId = Number(els.questionSelect.value || 0);
  const targetOptions = [["", selectedTextId ? "全部目標詞" : "請先選題號"]];
  if (selectedTextId) {
    const variant = state.variantByTextId.get(selectedTextId);
    if (variant) {
      variant.targets.forEach((target) => {
        targetOptions.push([target.target, target.target]);
      });
    }
  }
  setOptions(els.targetSelect, targetOptions);
  populateVariantOptions();
}

function populateVariantOptions() {
  const previousValue = els.variantSelect.value;
  const selectedTextId = Number(els.questionSelect.value || 0);
  const selectedTarget = els.targetSelect.value;
  const variantOptions = [["", selectedTarget ? "全部變體選項" : "請先選目標詞"]];
  if (selectedTextId && selectedTarget) {
    const target = state.variantByTextId
      .get(selectedTextId)
      ?.targets.find((item) => item.target === selectedTarget);
    if (target) {
      target.options.forEach((option) => variantOptions.push([option, option]));
    }
  }
  setOptions(els.variantSelect, variantOptions);
  if (variantOptions.some(([value]) => value === previousValue)) {
    els.variantSelect.value = previousValue;
  }
}

function setOptions(select, options) {
  select.innerHTML = options
    .map(([value, label]) => `<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`)
    .join("");
}

function renderAll() {
  renderStats();
  applyFilters();
  renderQuestions();
  renderCompare();
  renderSpeakers();
}

function renderStats() {
  const coverage = state.manifest.coverage;
  const stats = [
    ["題目", state.questions.length],
    ["錄音人", state.speakers.length],
    ["錄音", state.recordings.length],
    ["可篩選標註", coverage.annotatedRecordingPairs],
    ["未標註值", coverage.recordingsWithoutAnnotationValueCount],
  ];
  els.statsStrip.innerHTML = stats
    .map(([label, value]) => `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`)
    .join("");
}

function applyFilters() {
  const filters = getActiveFilters();
  const mode = document.querySelector('input[name="matchMode"]:checked').value;

  state.filtered = state.recordings.filter((recording) => {
    const checks = filters.map((filter) => filter(recording));
    if (checks.length === 0) return true;
    return mode === "or" ? checks.some(Boolean) : checks.every(Boolean);
  });

  if (!state.filtered.some((recording) => recording.recordingId === state.selectedRecordingId)) {
    state.selectedRecordingId = state.filtered[0]?.recordingId ?? null;
  }

  renderRecordings();
  renderDetail();
  renderCompare();
}

function getActiveFilters() {
  const filters = [];
  const keyword = normalize(els.keywordInput.value);
  const textId = Number(els.questionSelect.value || 0);
  const origin = els.originSelect.value;
  const status = els.annotationStatusSelect.value;
  const target = els.targetSelect.value;
  const variant = els.variantSelect.value;

  if (keyword) {
    filters.push((recording) => {
      const speaker = state.speakerById.get(recording.speakerId);
      const annotation = state.annotationByRecordingId.get(recording.recordingId);
      const haystack = [
        recording.recordingId,
        recording.speakerId,
        recording.questionNumber,
        recording.passageMandarin,
        recording.passageTaiwanese,
        speaker?.origin,
        ...Object.entries(annotation?.annotations || {}).flat(),
      ].join(" ");
      return normalize(haystack).includes(keyword);
    });
  }

  if (textId) {
    filters.push((recording) => recording.textId === textId);
  }

  if (origin) {
    filters.push((recording) => state.speakerById.get(recording.speakerId)?.origin === origin);
  }

  if (status !== "all") {
    filters.push((recording) => {
      const annotation = state.annotationByRecordingId.get(recording.recordingId);
      const hasRecord = Boolean(annotation);
      const hasValues = Boolean(annotation && Object.keys(annotation.annotations).length);
      if (status === "annotated") return hasValues;
      if (status === "empty") return hasRecord && !hasValues;
      if (status === "missing") return !hasRecord;
      return true;
    });
  }

  if (target) {
    filters.push((recording) => {
      const annotation = state.annotationByRecordingId.get(recording.recordingId);
      if (!annotation) return false;
      if (!(target in annotation.annotations)) return false;
      return variant ? annotation.annotations[target] === variant : true;
    });
  }

  return filters;
}

function renderRecordings() {
  const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
  state.page = Math.min(state.page, totalPages);
  const start = (state.page - 1) * state.pageSize;
  const pageRows = state.filtered.slice(start, start + state.pageSize);

  els.resultSummary.textContent = `${state.filtered.length} 筆結果，顯示 ${pageRows.length} 筆`;
  els.pageLabel.textContent = `第 ${state.page} / ${totalPages} 頁`;
  els.prevPageButton.disabled = state.page <= 1;
  els.nextPageButton.disabled = state.page >= totalPages;

  if (!pageRows.length) {
    els.recordingRows.innerHTML = `<tr><td colspan="6"><div class="empty-state">沒有符合條件的錄音</div></td></tr>`;
    return;
  }

  els.recordingRows.innerHTML = pageRows.map((recording) => {
    const speaker = state.speakerById.get(recording.speakerId);
    const annotation = state.annotationByRecordingId.get(recording.recordingId);
    const isSelected = recording.recordingId === state.selectedRecordingId;
    return `
      <tr class="${isSelected ? "is-selected" : ""}" data-recording-id="${recording.recordingId}">
        <td>第 ${recording.questionNumber} 題</td>
        <td class="sentence-cell">
          <strong>${escapeHtml(recording.passageTaiwanese)}</strong>
          <span>${escapeHtml(recording.passageMandarin)}</span>
        </td>
        <td>${recording.speakerId}</td>
        <td>${escapeHtml(speaker?.origin || "未填")}</td>
        <td>${renderAnnotationSummary(annotation)}</td>
        <td>${recording.audio.legacyPath || recording.audio.url ? "可播放" : "無路徑"}</td>
      </tr>
    `;
  }).join("");

  els.recordingRows.querySelectorAll("tr[data-recording-id]").forEach((row) => {
    row.addEventListener("click", () => {
      state.selectedRecordingId = row.dataset.recordingId;
      renderRecordings();
      renderDetail();
    });
  });
}

function renderAnnotationSummary(annotation) {
  if (!annotation) return `<span class="chip muted">未標註</span>`;
  const entries = Object.entries(annotation.annotations);
  if (!entries.length) return `<span class="chip amber">空標註</span>`;
  return `<div class="chip-list">${entries.slice(0, 3)
    .map(([target, value]) => `<span class="chip">${escapeHtml(target)}: ${escapeHtml(value)}</span>`)
    .join("")}${entries.length > 3 ? `<span class="chip muted">+${entries.length - 3}</span>` : ""}</div>`;
}

function renderDetail() {
  const recording = state.recordings.find((item) => item.recordingId === state.selectedRecordingId);
  if (!recording) {
    els.detailContent.className = "detail-empty";
    els.detailContent.innerHTML = `
      <h3>選擇一筆錄音</h3>
      <p>點選列表中的任一列，這裡會顯示錄音播放器、錄音人 metadata 與標註結果。</p>
    `;
    return;
  }

  const speaker = state.speakerById.get(recording.speakerId);
  const annotation = state.annotationByRecordingId.get(recording.recordingId);
  const audioSrc = getAudioSrc(recording);

  els.detailContent.className = "";
  els.detailContent.innerHTML = `
    <div class="detail-title">
      <div>
        <h3>${recording.recordingId}</h3>
        <p>第 ${recording.questionNumber} 題 · ${escapeHtml(speaker?.origin || "未填來源地")}</p>
      </div>
      ${annotation ? `<span class="chip ${Object.keys(annotation.annotations).length ? "" : "amber"}">${Object.keys(annotation.annotations).length ? "已標註" : "空標註"}</span>` : `<span class="chip muted">未標註</span>`}
    </div>

    <div class="audio-box">
      ${audioSrc ? `<audio controls preload="none" src="${escapeAttr(audioSrc)}"></audio>` : `<p class="muted">尚未設定音檔 URL</p>`}
    </div>

    <div class="detail-section">
      <h4>題目</h4>
      <p class="taiwanese">${escapeHtml(recording.passageTaiwanese)}</p>
      <p class="muted">${escapeHtml(recording.passageMandarin)}</p>
    </div>

    <div class="detail-section">
      <h4>錄音人 metadata</h4>
      <dl class="kv-list">
        ${kv("匿名代號", speaker?.speakerId)}
        ${kv("來源地", speaker?.origin)}
        ${kv("性別", speaker?.metadata?.gender)}
        ${kv("腔調", speaker?.metadata?.accent)}
        ${kv("教育", speaker?.metadata?.education)}
        ${kv("第一語言", speaker?.metadata?.firstLanguage)}
        ${kv("錄音數", speaker?.recordingCount)}
        ${kv("有標註數", speaker?.annotatedRecordingCount)}
      </dl>
    </div>

    <div class="detail-section">
      <h4>方音標註</h4>
      ${renderAnnotationDetail(annotation)}
    </div>
  `;
}

function renderAnnotationDetail(annotation) {
  if (!annotation) return `<p class="muted">此錄音沒有標註紀錄。</p>`;
  const entries = Object.entries(annotation.annotations);
  if (!entries.length) return `<p class="muted">此錄音有標註紀錄，但沒有實際選項值。</p>`;
  return `<div class="annotation-list">${entries
    .map(([target, value]) => `
      <div class="annotation-item">
        <span>${escapeHtml(target)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `)
    .join("")}</div>`;
}

function renderQuestions() {
  els.questionGrid.innerHTML = state.questions.map((question) => {
    const variant = state.variantByTextId.get(question.textId);
    return `
      <article class="question-card">
        <h3>第 ${question.questionNumber} 題</h3>
        <p class="taiwanese">${escapeHtml(question.passageTaiwanese)}</p>
        <p class="muted">${escapeHtml(question.passageMandarin)}</p>
        <div class="chip-list">
          ${(variant?.targets || []).map((target) => `<span class="chip">${escapeHtml(target.target)}</span>`).join("")}
        </div>
      </article>
    `;
  }).join("");
}

function renderCompare() {
  const selectedTextId = Number(els.questionSelect.value || state.questions[0]?.textId || 7);
  const rows = state.recordings.filter((recording) => recording.textId === selectedTextId);
  const question = state.questionByTextId.get(selectedTextId);
  const groups = new Map();
  rows.forEach((recording) => {
    const origin = state.speakerById.get(recording.speakerId)?.origin || "未填";
    if (!groups.has(origin)) groups.set(origin, []);
    groups.get(origin).push(recording);
  });

  els.compareLayout.innerHTML = `
    <div class="compare-group">
      <h3>第 ${question?.questionNumber || selectedTextId - 6} 題</h3>
      <p class="taiwanese">${escapeHtml(question?.passageTaiwanese || "")}</p>
      <p class="muted">${escapeHtml(question?.passageMandarin || "")}</p>
    </div>
    ${[...groups.entries()].sort((a, b) => b[1].length - a[1].length).map(([origin, items]) => `
      <section class="compare-group">
        <h3>${escapeHtml(origin)} (${items.length})</h3>
        <div class="mini-list">
          ${items.map((recording) => {
            const annotation = state.annotationByRecordingId.get(recording.recordingId);
            return `
              <div class="mini-row">
                <strong>${recording.speakerId}</strong>
                <div>${renderAnnotationSummary(annotation)}</div>
                ${getAudioSrc(recording) ? `<audio controls preload="none" src="${escapeAttr(getAudioSrc(recording))}"></audio>` : `<span class="muted">無音檔</span>`}
              </div>
            `;
          }).join("")}
        </div>
      </section>
    `).join("")}
  `;
}

function renderSpeakers() {
  els.speakerGrid.innerHTML = state.speakers.map((speaker) => {
    const rows = state.recordings.filter((recording) => recording.speakerId === speaker.speakerId);
    const completion = `${rows.length}/80`;
    return `
      <article class="speaker-card">
        <h3>${speaker.speakerId}</h3>
        <p><strong>${escapeHtml(speaker.origin || "未填來源地")}</strong></p>
        <p class="muted">錄音 ${completion} · 有標註 ${speaker.annotatedRecordingCount}</p>
        <dl class="kv-list">
          ${kv("性別", speaker.metadata.gender)}
          ${kv("腔調", speaker.metadata.accent)}
          ${kv("教育", speaker.metadata.education)}
          ${kv("第一語言", speaker.metadata.firstLanguage)}
        </dl>
        <button class="secondary-button speaker-filter" data-speaker-id="${speaker.speakerId}" type="button">查看錄音</button>
      </article>
    `;
  }).join("");

  els.speakerGrid.querySelectorAll(".speaker-filter").forEach((button) => {
    button.addEventListener("click", () => {
      els.keywordInput.value = button.dataset.speakerId;
      switchTab("search");
      state.page = 1;
      applyFilters();
    });
  });
}

function switchTab(tabName) {
  state.activeTab = tabName;
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.tab === tabName);
  });
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("is-active", view.id === `${tabName}View`);
  });
  if (tabName === "compare") renderCompare();
}

function resetFilters() {
  els.keywordInput.value = "";
  els.questionSelect.value = "";
  els.originSelect.value = "";
  els.annotationStatusSelect.value = "all";
  populateTargetControls();
  document.querySelector('input[name="matchMode"][value="and"]').checked = true;
  state.page = 1;
  applyFilters();
}

function exportCurrentResults() {
  const payload = state.filtered.map((recording) => ({
    recordingId: recording.recordingId,
    speakerId: recording.speakerId,
    legacyUserId: recording.legacyUserId,
    textId: recording.textId,
    questionNumber: recording.questionNumber,
    origin: state.speakerById.get(recording.speakerId)?.origin || null,
    audio: recording.audio,
    annotations: state.annotationByRecordingId.get(recording.recordingId)?.annotations || null,
  }));
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "filtered-recordings.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

function getAudioSrc(recording) {
  if (recording.audio.url) return recording.audio.url;
  if (!recording.audio.legacyPath) return "";
  return `../${recording.audio.legacyPath.replace(/^\/+/, "")}`;
}

function kv(label, value) {
  const display = value === null || value === undefined || value === "" ? "未填" : value;
  return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(display))}</dd>`;
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
