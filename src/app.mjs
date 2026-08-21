import {
  buildReadyCsv,
  cleanDataset,
  createAuditTrail,
  getMappingCoverage,
  isMappingReady,
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
  INVALID_PHONE: "Phone is not E.164-shaped or repeats one digit only"
};

const requiredFields = ["company", "email"];

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
  mappingWarning: document.querySelector("#mapping-warning"),
  mappingState: document.querySelector("#mapping-state"),
  schemaSummary: document.querySelector("#schema-summary"),
  railSchemaStatus: document.querySelector("#rail-schema-status"),
  progressMap: document.querySelector("#progress-map"),
  progressMapState: document.querySelector("#progress-map-state"),
  progressReview: document.querySelector("#progress-review"),
  progressReviewState: document.querySelector("#progress-review-state"),
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

function getMissingRequiredFields() {
  return getMappingCoverage(state.mapping).missingRequired;
}

function fieldList(fields) {
  return fields.map((field) => fieldLabels[field]).join(" + ");
}

function duplicateMappingDetail(duplicateSources) {
  return duplicateSources
    .map(({ source, targets }) => `${source} is assigned to ${fieldList(targets)}`)
    .join("; ");
}

function buildAuditState() {
  const { missingRequired, skippedOptional, duplicateSources } = getMappingCoverage(state.mapping);
  const classification = duplicateSources.length ? "blocked" : missingRequired.length ? "pending" : "complete";
  const summary = classification === "complete"
    ? summarizeResults(state.results)
    : { total: state.parsed.rows.length, ready: null, review: null, rejected: null };
  let events;
  if (classification === "complete") {
    events = createAuditTrail(state.results, state.fileName, undefined, {
      skippedOptionalFields: skippedOptional
    });
  } else {
    events = [
      { event: "FILE_PARSED", detail: `${state.fileName} · ${state.parsed.rows.length} rows` }
    ];
    if (skippedOptional.length) {
      events.push(createAuditTrail([], state.fileName, undefined, {
        skippedOptionalFields: skippedOptional
      }).find(({ event }) => event === "OPTIONAL_FIELDS_SKIPPED"));
    }
    if (missingRequired.length) {
      events.push({
        event: "MAPPING_REQUIRED",
        detail: `${fieldList(missingRequired)} must be mapped before rules run`
      });
    }
    if (duplicateSources.length) {
      events.push({
        event: "MAPPING_CONFLICT",
        detail: `${duplicateMappingDetail(duplicateSources)} · choose unique source columns before rules run`
      });
    }
  }

  return {
    classification,
    missingRequired,
    ...(skippedOptional.length ? { skippedOptional } : {}),
    ...(duplicateSources.length ? { duplicateSources } : {}),
    summary,
    events
  };
}

function recalculate({ keepSelection = true } = {}) {
  state.results = isMappingReady(state.mapping) ? cleanDataset(state.parsed.rows, state.mapping) : [];
  const stillExists = keepSelection && state.results.some(({ row }) => row === state.selectedRow);
  if (!stillExists) state.selectedRow = state.results[0]?.row ?? null;
  renderAll();
}

function renderMetrics() {
  const summary = summarizeResults(state.results);
  const { duplicateSources } = getMappingCoverage(state.mapping);
  const schemaReady = isMappingReady(state.mapping);
  for (const key of ["total", "ready", "review", "rejected"]) {
    document.querySelector(`#metric-${key}`).textContent = key === "total" ? state.parsed.rows.length : summary[key];
    document.querySelector(`#count-${key === "total" ? "all" : key}`).textContent = summary[key];
  }
  elements.exportReady.textContent = schemaReady
    ? `Export ${summary.ready} ready row${summary.ready === 1 ? "" : "s"}`
    : duplicateSources.length ? "Resolve mapping conflict to export" : "Complete mapping to export";
  elements.exportReady.disabled = !schemaReady || summary.ready === 0;
}

function renderMappingStatus() {
  const { mappedCount, totalCount, missingRequired, skippedOptional, duplicateSources } = getMappingCoverage(state.mapping);
  const schemaReady = missingRequired.length === 0 && duplicateSources.length === 0;
  const count = `${mappedCount}/${totalCount} mapped`;
  const missing = fieldList(missingRequired);
  const skipped = fieldList(skippedOptional);
  const phoneSkipped = skippedOptional.includes("phone");
  const countrySkipped = skippedOptional.includes("country");

  if (duplicateSources.length) {
    const requiredNote = missingRequired.length ? ` · ${missing} required` : "";
    const conflictDetail = duplicateMappingDetail(duplicateSources);
    elements.mappingState.textContent = `${count} · mapping conflict${requiredNote}`;
    elements.schemaSummary.textContent = `Schema: ${count} · resolve duplicate source mapping${requiredNote}`;
    elements.railSchemaStatus.textContent = `${count} · mapping conflict`;
    elements.progressMapState.textContent = `${mappedCount}/${totalCount} fields · conflict`;
    elements.mappingWarning.textContent = `Mapping conflict: ${conflictDetail}. Each source column can map to only one CRM field. Choose a unique source before classification or export.`;
    elements.mappingWarning.hidden = false;
  } else if (!schemaReady) {
    const optionalNote = skippedOptional.length ? ` · optional ${skipped} skipped` : "";
    elements.mappingState.textContent = `${count} · ${missing} required${optionalNote}`;
    elements.schemaSummary.textContent = `Schema: ${count} · map ${missing} to classify rows${optionalNote}`;
    elements.railSchemaStatus.textContent = `${count} · mapping incomplete${optionalNote}`;
    elements.progressMapState.textContent = `${mappedCount}/${totalCount} fields${skippedOptional.length ? ` · ${skipped} optional` : ""}`;
    elements.mappingWarning.hidden = true;
  } else if (skippedOptional.length) {
    elements.mappingState.textContent = `${count} · ready · optional ${skipped} skipped`;
    elements.schemaSummary.textContent = phoneSkipped
      ? `Schema: ${count} · required-field and email checks active · optional ${skipped} skipped · phone normalization and E.164-shape checks not run`
      : `Schema: ${count} · email and E.164-shape checks · optional ${skipped} skipped${countrySkipped ? " · country-based phone normalization not run" : ""}`;
    elements.railSchemaStatus.textContent = `${count} · optional ${skipped} skipped`;
    elements.progressMapState.textContent = `${mappedCount}/${totalCount} fields · ${skipped} optional`;
    elements.mappingWarning.hidden = true;
  } else {
    elements.mappingState.textContent = `${count} · ready`;
    elements.schemaSummary.textContent = `Schema: ${count} · email and E.164-shape checks`;
    elements.railSchemaStatus.textContent = `${count} · format checks active`;
    elements.progressMapState.textContent = `${mappedCount}/${totalCount} fields`;
    elements.mappingWarning.hidden = true;
  }
  elements.mappingState.classList.toggle("is-incomplete", !schemaReady);
  elements.mappingState.classList.toggle("has-conflict", duplicateSources.length > 0);
  elements.mappingState.classList.toggle("has-optional-skips", schemaReady && skippedOptional.length > 0);
  elements.progressMap.classList.toggle("is-done", schemaReady);
  elements.progressMap.classList.toggle("is-active", !schemaReady);
  elements.progressReview.classList.toggle("is-active", schemaReady);
  elements.progressReviewState.textContent = schemaReady ? "Action needed" : "Waiting for mapping";
}

function renderMapping() {
  const options = ["", ...state.parsed.headers];
  const { duplicateSources } = getMappingCoverage(state.mapping);
  const duplicateTargets = new Set(duplicateSources.flatMap(({ targets }) => targets));
  elements.mappingGrid.innerHTML = Object.entries(fieldLabels).map(([target, label]) => `
    <div class="mapping-field ${!requiredFields.includes(target) && !state.mapping[target] ? "is-optional-skipped" : ""} ${duplicateTargets.has(target) ? "is-conflict" : ""}">
      <label for="map-${target}"><span>Source column</span><small>${requiredFields.includes(target) ? "Required" : "Optional"}</small></label>
      <select id="map-${target}" data-map-target="${target}" aria-label="Source column for ${label}, ${requiredFields.includes(target) ? "required" : "optional"} field" ${duplicateTargets.has(target) ? 'aria-invalid="true" aria-describedby="mapping-warning"' : ""}>
        ${options.map((header) => `<option value="${escapeHtml(header)}" ${state.mapping[target] === header ? "selected" : ""}>${escapeHtml(header || "Not mapped")}</option>`).join("")}
      </select>
      <span class="mapping-target"><span aria-hidden="true">→</span><span>${label}</span><small>${duplicateTargets.has(target) ? "Conflict" : requiredFields.includes(target) ? "Must map" : state.mapping[target] ? "Mapped" : "Skipped"}</small></span>
    </div>
  `).join("");

  elements.mappingGrid.querySelectorAll("select").forEach((select) => {
    select.addEventListener("change", () => {
      state.mapping[select.dataset.mapTarget] = select.value;
      recalculate();
    });
  });
}

function renderRecords() {
  const { duplicateSources } = getMappingCoverage(state.mapping);
  const schemaReady = isMappingReady(state.mapping);
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
  if (duplicateSources.length) {
    elements.emptyState.innerHTML = "<strong>Resolve the duplicate source mapping</strong><span>Each source column can map to one CRM field before rows are classified or exported.</span>";
  } else if (!schemaReady) {
    elements.emptyState.innerHTML = "<strong>Complete the required mapping</strong><span>Map Company and Email before rows are classified or exported.</span>";
  } else {
    elements.emptyState.innerHTML = "<strong>No rows in this queue</strong><span>Try another status filter.</span>";
  }

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
  if (!selected) {
    const { duplicateSources } = getMappingCoverage(state.mapping);
    elements.selectedRow.textContent = "Row —";
    elements.beforeValues.innerHTML = duplicateSources.length
      ? "<dt>Status</dt><dd>Mapping conflict</dd>"
      : "<dt>Status</dt><dd>Waiting for mapping</dd>";
    elements.afterValues.innerHTML = "<dt>Status</dt><dd>Not evaluated</dd>";
    elements.ruleCallout.innerHTML = duplicateSources.length
      ? `<strong>Export blocked</strong><br>${escapeHtml(duplicateMappingDetail(duplicateSources))}. Choose unique source columns to evaluate rows.`
      : "<strong>Export paused</strong><br>Complete the required mapping to evaluate rows.";
    return;
  }
  elements.selectedRow.textContent = `Row ${selected.row}`;
  elements.beforeValues.innerHTML = definitionList(selected.source, true);
  elements.afterValues.innerHTML = definitionList(selected.normalized);
  elements.ruleCallout.innerHTML = `<strong>${selected.status === "ready" ? "Passed" : selected.status === "review" ? "Review suggested" : "Export blocked"}</strong><br>${escapeHtml(selected.reasons.map(reasonLabel).join(" · "))}`;
}

function renderAudit() {
  const { events } = buildAuditState();
  elements.auditList.innerHTML = events.map((entry) => `
    <li class="${entry.event === "MAPPING_REQUIRED" ? "is-pending" : ""}"><strong>${escapeHtml(entry.event.replaceAll("_", " "))}</strong><small>${escapeHtml(entry.detail)}</small></li>
  `).join("");
}

function renderAll() {
  elements.fileName.textContent = state.fileName;
  elements.fileMeta.textContent = `${state.parsed.rows.length} rows · processed in this tab`;
  renderMetrics();
  renderMapping();
  renderMappingStatus();
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
  if (!isMappingReady(state.mapping)) {
    showToast("Resolve the mapping before exporting ready rows.");
    return;
  }
  downloadFile("cleangrid-ready.csv", buildReadyCsv(state.results), "text/csv;charset=utf-8");
  showToast("Ready rows downloaded locally.");
});

elements.exportAudit.addEventListener("click", () => {
  const auditState = buildAuditState();
  const payload = {
    project: "CleanGrid Local",
    provenance: "personal_demo",
    externalActions: false,
    file: state.fileName,
    ...auditState
  };
  downloadFile("cleangrid-audit.json", JSON.stringify(payload, null, 2), "application/json");
  showToast("Audit JSON downloaded locally.");
});

state.mapping = suggestColumnMapping(state.parsed.headers);
recalculate({ keepSelection: false });
