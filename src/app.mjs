import {
  buildReadyCsv,
  cleanDataset,
  createAuditTrail,
  parseCsv,
  suggestColumnMapping,
  summarizeResults
} from "./domain.mjs";

const SAMPLE_CSV = `Company Name,Full Name,E-mail,Mobile,Market
Nordlicht Studio GmbH,Mara Weiss, HELLO@NORDLICHT.EXAMPLE ,+49 000 000 0000,DE
Harbor & Field Ltd,Theo Martin,theo@harborfield.example,+44 0000 000000,GB
Nordlicht Studio GmbH,Mara Weiss,hello@nordlicht.example,+49 000 000 0000,DE
Atelier Juniper,Lea Moreau,lea@atelier-juniper.example,+33 0 00 00 00 00,FR
Kernwerk GmbH,Felix Roth,felix@kernwerk.example,123,DE
Paper Kite Studio,Sofia Engel,sofia.paperkite.example,+49 000 000 0001,DE
,Jonas Berg,jonas@fjordline.example,+47 000 00 000,NO
Bright Mile LLC,Ava Reed,ava@brightmile.example,(000) 000-0000,US`;

const fieldLabels = {
  company: "Company",
  contact: "Contact",
  email: "Email",
  phone: "Phone",
  country: "Country"
};

const reasonLabels = {
  NORMALIZED: "Formatting normalized",
  MISSING_COMPANY: "Company is required",
  MISSING_EMAIL: "Email is required",
  INVALID_EMAIL: "Email format is invalid",
  INVALID_PHONE: "Phone needs review"
};

const state = {
  fileName: "crm-contacts-august.csv",
  parsed: parseCsv(SAMPLE_CSV),
  mapping: {},
  results: [],
  selectedRow: null,
  filter: "all"
};

const elements = {
  fileInput: document.querySelector("#file-input"),
  fileName: document.querySelector("#file-name"),
  fileMeta: document.querySelector("#file-meta"),
  mappingGrid: document.querySelector("#mapping-grid"),
  mappingState: document.querySelector("#mapping-state"),
  recordsBody: document.querySelector("#records-body"),
  emptyState: document.querySelector("#empty-state"),
  selectedRow: document.querySelector("#selected-row"),
  beforeValues: document.querySelector("#before-values"),
  afterValues: document.querySelector("#after-values"),
  ruleCallout: document.querySelector("#rule-callout"),
  auditList: document.querySelector("#audit-list"),
  exportReady: document.querySelector("#export-ready"),
  exportAudit: document.querySelector("#export-audit"),
  toast: document.querySelector("#toast")
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function reasonLabel(reason) {
  if (reason.startsWith("DUPLICATE_OF_ROW_")) return `Duplicate of row ${reason.split("_").at(-1)}`;
  return reasonLabels[reason] ?? reason.replaceAll("_", " ").toLowerCase();
}

function recalculate({ keepSelection = true } = {}) {
  state.results = cleanDataset(state.parsed.rows, state.mapping);
  const stillExists = keepSelection && state.results.some(({ row }) => row === state.selectedRow);
  if (!stillExists) state.selectedRow = state.results[0]?.row ?? null;
  renderAll();
}

function renderMetrics() {
  const summary = summarizeResults(state.results);
  for (const key of ["total", "ready", "review", "rejected"]) {
    document.querySelector(`#metric-${key}`).textContent = summary[key];
    document.querySelector(`#count-${key === "total" ? "all" : key}`).textContent = summary[key];
  }
  elements.exportReady.textContent = `Export ${summary.ready} ready row${summary.ready === 1 ? "" : "s"}`;
  elements.exportReady.disabled = summary.ready === 0;
}

function renderMapping() {
  const options = ["", ...state.parsed.headers];
  elements.mappingGrid.innerHTML = Object.entries(fieldLabels).map(([target, label]) => `
    <div class="mapping-field">
      <label for="map-${target}">Source column</label>
      <select id="map-${target}" data-map-target="${target}" aria-label="Source column for ${label}">
        ${options.map((header) => `<option value="${escapeHtml(header)}" ${state.mapping[target] === header ? "selected" : ""}>${escapeHtml(header || "Not mapped")}</option>`).join("")}
      </select>
      <span class="mapping-target"><span aria-hidden="true">→</span> ${label}</span>
    </div>
  `).join("");

  elements.mappingGrid.querySelectorAll("select").forEach((select) => {
    select.addEventListener("change", () => {
      state.mapping[select.dataset.mapTarget] = select.value;
      elements.mappingState.textContent = "Mapping updated";
      recalculate();
    });
  });
}

function renderRecords() {
  const visible = state.filter === "all" ? state.results : state.results.filter(({ status }) => status === state.filter);
  elements.recordsBody.innerHTML = visible.map((result) => `
    <tr data-row="${result.row}" class="${result.row === state.selectedRow ? "is-selected" : ""}" tabindex="0" aria-label="Inspect row ${result.row}">
      <td>#${result.row}</td>
      <td class="company-cell">${escapeHtml(result.normalized.company || "—")}</td>
      <td>${escapeHtml(result.normalized.email || "—")}</td>
      <td>${escapeHtml(result.normalized.phone || "—")}</td>
      <td><span class="status-badge status-${result.status}">${result.status}</span></td>
      <td class="reason">${escapeHtml(result.reasons.map(reasonLabel).join(" · "))}</td>
    </tr>
  `).join("");
  elements.emptyState.hidden = visible.length !== 0;

  elements.recordsBody.querySelectorAll("tr").forEach((row) => {
    const select = () => {
      state.selectedRow = Number(row.dataset.row);
      renderRecords();
      renderInspection();
    };
    row.addEventListener("click", select);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select();
      }
    });
  });
}

function definitionList(values, mappingMode = false) {
  return Object.entries(fieldLabels).map(([field, label]) => {
    const value = mappingMode ? values[state.mapping[field]] : values[field];
    return `<dt>${label}</dt><dd title="${escapeHtml(value || "Empty")}">${escapeHtml(value || "—")}</dd>`;
  }).join("");
}

function renderInspection() {
  const selected = state.results.find(({ row }) => row === state.selectedRow) ?? state.results[0];
  if (!selected) return;
  elements.selectedRow.textContent = `Row ${selected.row}`;
  elements.beforeValues.innerHTML = definitionList(selected.source, true);
  elements.afterValues.innerHTML = definitionList(selected.normalized);
  elements.ruleCallout.innerHTML = `<strong>${selected.status === "ready" ? "Passed" : selected.status === "review" ? "Review suggested" : "Export blocked"}</strong><br>${escapeHtml(selected.reasons.map(reasonLabel).join(" · "))}`;
}

function renderAudit() {
  const audit = createAuditTrail(state.results, state.fileName);
  elements.auditList.innerHTML = audit.map((entry) => `
    <li><strong>${escapeHtml(entry.event.replaceAll("_", " "))}</strong><small>${escapeHtml(entry.detail)}</small></li>
  `).join("");
}

function renderAll() {
  elements.fileName.textContent = state.fileName;
  elements.fileMeta.textContent = `${state.parsed.rows.length} rows · processed in this tab`;
  renderMetrics();
  renderMapping();
  renderRecords();
  renderInspection();
  renderAudit();
}

function downloadFile(name, contents, type) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastTimer = setTimeout(() => { elements.toast.hidden = true; }, 2600);
}

elements.fileInput.addEventListener("change", async () => {
  const [file] = elements.fileInput.files;
  if (!file) return;
  try {
    const parsed = parseCsv(await file.text());
    if (parsed.headers.length === 0 || parsed.rows.length === 0) throw new Error("The CSV has no data rows.");
    state.fileName = file.name;
    state.parsed = parsed;
    state.mapping = suggestColumnMapping(parsed.headers);
    state.filter = "all";
    state.selectedRow = null;
    recalculate({ keepSelection: false });
    showToast("Local file parsed. Nothing was uploaded.");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not parse this CSV.");
  } finally {
    elements.fileInput.value = "";
  }
});

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((tab) => tab.classList.toggle("is-active", tab === button));
    renderRecords();
  });
});

elements.exportReady.addEventListener("click", () => {
  downloadFile("cleangrid-ready.csv", buildReadyCsv(state.results), "text/csv;charset=utf-8");
  showToast("Ready rows downloaded locally.");
});

elements.exportAudit.addEventListener("click", () => {
  const payload = {
    project: "CleanGrid Local",
    provenance: "personal_demo",
    externalActions: false,
    file: state.fileName,
    summary: summarizeResults(state.results),
    events: createAuditTrail(state.results, state.fileName)
  };
  downloadFile("cleangrid-audit.json", JSON.stringify(payload, null, 2), "application/json");
  showToast("Audit JSON downloaded locally.");
});

state.mapping = suggestColumnMapping(state.parsed.headers);
recalculate({ keepSelection: false });
