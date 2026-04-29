(function () {
  const GROUP_META = {
    bombeiros: {
      label: "Dunamis Bombeiros",
      logo: "./images/logo-dunamis-bombeiros.png",
      whatsappNumber: "5511919125032"
    },
    servicos: {
      label: "Dunamis Servicos",
      logo: "./images/logo-dunamis-servicos.png",
      whatsappNumber: "5511940315275"
    },
    seguranca: {
      label: "Dunamis Seguranca",
      logo: "./images/logo-dunamis-seguranca.png",
      whatsappNumber: "5511940315275"
    },
    rbfacilities: {
      label: "RB Facilities",
      logo: "./images/logo-rb.png",
      whatsappNumber: "5511940315275"
    }
  };

  const ADMIN_WORKPLACE_KEYWORDS = ["INSS", "PROCESSO", "ADMINISTRATIVO", "ADM"];

  const state = {
    group: null,
    provider: null,
    peopleIndex: {},
    workplaces: [],
    submitResult: null
  };

  class SupabaseProvider {
    constructor(config) {
      this.config = config || {};
      this.supabase = this.config.supabase || {};
      this.functionsBaseUrl = deriveFunctionsBaseUrl(this.supabase);
      this.anonKey = this.supabase.anonKey || "";
    }

    isConfigured() {
      return Boolean(this.functionsBaseUrl && this.anonKey);
    }

    async loadDirectory(group) {
      return this.request("nexti-directory", {
        method: "GET",
        query: { group: group }
      });
    }

    async submitRequest(payload) {
      return this.request("troca-request", {
        method: "POST",
        body: payload
      });
    }

    async request(functionName, options) {
      if (!this.isConfigured()) {
        throw new Error("Configure js/app-config.js com SUPABASE projectUrl/functionsBaseUrl e anonKey.");
      }

      const url = new URL(`${this.functionsBaseUrl.replace(/\/$/, "")}/${functionName}`);
      const query = options && options.query ? options.query : {};

      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.set(key, String(value));
        }
      });

      const response = await fetch(url.toString(), {
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          apikey: this.anonKey,
          Authorization: `Bearer ${this.anonKey}`
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        cache: "no-store"
      });

      const raw = await response.text();
      const data = raw ? safeJsonParse(raw) : {};

      if (!response.ok) {
        const message = data && data.error ? data.error : raw || "Falha ao chamar a API interna.";
        throw new Error(message);
      }

      return data;
    }
  }

  function deriveFunctionsBaseUrl(supabaseConfig) {
    if (!supabaseConfig) return "";
    if (supabaseConfig.functionsBaseUrl) {
      return String(supabaseConfig.functionsBaseUrl).replace(/\/$/, "");
    }
    if (supabaseConfig.projectUrl) {
      return `${String(supabaseConfig.projectUrl).replace(/\/$/, "")}/functions/v1`;
    }
    return "";
  }

  function safeJsonParse(value) {
    try {
      return JSON.parse(value);
    } catch (error) {
      return {};
    }
  }

  function getRuntimeConfig() {
    return window.APP_CONFIG || {};
  }

  function getGroupConfig(group) {
    const runtime = getRuntimeConfig();
    const runtimeGroups = runtime.groups || {};
    return Object.assign({}, GROUP_META[group] || {}, runtimeGroups[group] || {});
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeDigits(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (!digits) return "";
    return String(parseInt(digits, 10));
  }

  function buildEnrolmentAliases(value) {
    const raw = String(value || "").trim();
    const aliases = new Set();
    if (!raw) return [];

    const digits = normalizeDigits(raw);
    if (digits) aliases.add(digits);

    if (raw.includes("-")) {
      const lastPart = raw.split("-").pop();
      const lastDigits = normalizeDigits(lastPart);
      if (lastDigits) aliases.add(lastDigits);
    }

    return Array.from(aliases);
  }

  function mapPersonSituation(person) {
    if (person.blockedReason) return String(person.blockedReason).toUpperCase();
    const value = Number(person.personSituationId || 0);
    if (value === 1) return "ATIVO";
    if (value === 2) return "AUSENTE";
    if (value === 3) return "DEMITIDO";
    if (value === 4) return "INATIVO";
    return value ? `SITUACAO ${value}` : "ATIVO";
  }

  function preparePerson(person) {
    const aliases = buildEnrolmentAliases(person.enrolment);
    const statusLabel = mapPersonSituation(person);
    const blocked = Boolean(person.blocked) || statusLabel !== "ATIVO";

    return Object.assign({}, person, {
      aliases: aliases,
      statusLabel: statusLabel,
      blocked: blocked
    });
  }

  function buildPeopleIndex(people) {
    const index = {};

    people.forEach((rawPerson) => {
      const person = preparePerson(rawPerson);
      person.aliases.forEach((alias) => {
        if (!index[alias]) {
          index[alias] = { type: "single", person: person };
          return;
        }

        if (index[alias].type === "single") {
          index[alias] = {
            type: "duplicate",
            candidates: [index[alias].person, person]
          };
          return;
        }

        index[alias].candidates.push(person);
      });
    });

    return index;
  }

  function processDirectory(payload) {
    const workplaces = Array.isArray(payload.workplaces) ? payload.workplaces : [];
    const people = Array.isArray(payload.persons) ? payload.persons : [];

    state.workplaces = workplaces.slice().sort((left, right) => {
      return String(left.name || "").localeCompare(String(right.name || ""), "pt-BR");
    });
    state.peopleIndex = buildPeopleIndex(people);

    populateWorkplaces();

    if (document.getElementById("re_sol").value) buscar("sol");
    if (document.getElementById("re_sub").value) buscar("sub");
  }

  function populateWorkplaces() {
    const select = document.getElementById("unidade_troca");
    select.innerHTML = '<option value="">Selecione a unidade...</option>';

    state.workplaces.forEach((workplace) => {
      const name = String(workplace.name || "").trim();
      if (!name) return;

      const shouldHide = ADMIN_WORKPLACE_KEYWORDS.some((keyword) => {
        return name.toUpperCase().includes(keyword);
      });

      if (shouldHide) return;

      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      option.dataset.externalId = workplace.externalId || "";
      select.appendChild(option);
    });
  }

  function findPersonEntryByInput(inputId) {
    const aliases = buildEnrolmentAliases(document.getElementById(inputId).value);
    if (!aliases.length) return null;

    for (const alias of aliases) {
      if (state.peopleIndex[alias]) {
        return state.peopleIndex[alias];
      }
    }

    return null;
  }

  function getUniquePerson(inputId) {
    const entry = findPersonEntryByInput(inputId);
    return entry && entry.type === "single" ? entry.person : null;
  }

  function setLookupStatus(type, entry) {
    const nameField = document.getElementById(`nome_${type}`);
    const errorField = document.getElementById(`e_status_${type}`);

    if (!entry) {
      nameField.value = "";
      nameField.className = "";
      if (errorField) errorField.style.display = "none";
      return;
    }

    if (entry.type === "duplicate") {
      const candidates = entry.candidates.slice(0, 3).map((person) => person.name).join(", ");
      nameField.value = "Matricula duplicada na base";
      nameField.className = "status-afastado";
      if (errorField) {
        errorField.innerHTML = `🚫 <strong>Bloqueado:</strong> Matricula ambigua na Nexti. Exemplos: <strong>${escapeHtml(candidates)}</strong>.`;
        errorField.style.display = "block";
      }
      return;
    }

    const person = entry.person;
    if (person.blocked) {
      nameField.value = `⚠️ ${person.name} (${person.statusLabel})`;
      nameField.className = "status-afastado";
      if (errorField) {
        errorField.innerHTML = `🚫 <strong>Bloqueado:</strong> Colaborador consta como <strong>${escapeHtml(person.statusLabel)}</strong> na Nexti.`;
        errorField.style.display = "block";
      }
      return;
    }

    nameField.value = person.name;
    nameField.className = "nome-encontrado";
    if (errorField) errorField.style.display = "none";
  }

  function buscar(tipo) {
    const entry = findPersonEntryByInput(`re_${tipo}`);
    setLookupStatus(tipo, entry);

    if (tipo === "sub" || tipo === "sol") {
      if (validarMesmoRE()) validarMesmaTurma();
    }

    if (tipo === "sol") validarEscala("data_folga");
  }

  function abrirCalendario(id) {
    const input = document.getElementById(id);
    if ("showPicker" in HTMLInputElement.prototype) {
      input.showPicker();
      return;
    }
    input.focus();
    input.click();
  }

  function validarMesmoRE() {
    const r1 = normalizeDigits(document.getElementById("re_sol").value);
    const r2 = normalizeDigits(document.getElementById("re_sub").value);
    const err = document.getElementById("e_re");

    if (r1 && r2 && r1 === r2) {
      err.style.display = "block";
      err.innerHTML = "❌ <strong>Erro:</strong> Voce colocou o seu proprio RE. Voce precisa trocar com <strong>outra pessoa</strong>.";
      return false;
    }

    err.style.display = "none";
    return true;
  }

  function validarMesmaTurma() {
    const person1 = getUniquePerson("re_sol");
    const person2 = getUniquePerson("re_sub");
    const err = document.getElementById("e_re");

    if (!person1 || !person2) return true;

    if (
      person1.rotationCode !== undefined &&
      person2.rotationCode !== undefined &&
      person1.rotationCode !== null &&
      person2.rotationCode !== null &&
      Number(person1.rotationCode) === Number(person2.rotationCode)
    ) {
      err.style.display = "block";
      err.innerHTML = "❌ <strong>Troca invalida</strong><br>Nao e possivel realizar a troca com um colaborador da mesma escala.";
      return false;
    }

    return true;
  }

  function getRefFolha(value) {
    const date = new Date(`${value}T00:00:00`);
    let month = date.getMonth();
    let year = date.getFullYear();

    if (date.getDate() >= 22) {
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
    }

    return `${year}-${month}`;
  }

  function getIntervaloFolha(value) {
    const date = new Date(`${value}T00:00:00`);
    let startDate;
    let finishDate;

    if (date.getDate() >= 22) {
      startDate = new Date(date.getFullYear(), date.getMonth(), 22);
      finishDate = new Date(date.getFullYear(), date.getMonth() + 1, 21);
    } else {
      startDate = new Date(date.getFullYear(), date.getMonth() - 1, 22);
      finishDate = new Date(date.getFullYear(), date.getMonth(), 21);
    }

    return `${startDate.toLocaleDateString("pt-BR")} ate ${finishDate.toLocaleDateString("pt-BR")}`;
  }

  function validarTroca() {
    const d1 = document.getElementById("data_folga").value;
    const d2 = document.getElementById("data_pagamento").value;
    const errEscala = document.getElementById("e_escala");
    const errFolha = document.getElementById("e_folha");

    errEscala.style.display = "none";
    errFolha.style.display = "none";

    if (!d1 || !d2) return true;

    let valid = true;
    const date1 = new Date(`${d1}T00:00:00`);
    const date2 = new Date(`${d2}T00:00:00`);
    const diffDays = Math.round(Math.abs(date2 - date1) / (1000 * 60 * 60 * 24));

    if (diffDays % 2 === 0) {
      errEscala.style.display = "block";
      errEscala.innerHTML = "❌ <strong>Datas na mesma escala:</strong> Pelas datas informadas, o posto ficaria vazio.<br>Confira se voce digitou as datas corretamente, pois a troca deve ocorrer entre escalas diferentes.";
      valid = false;
    }

    if (getRefFolha(d1) !== getRefFolha(d2)) {
      const interval = getIntervaloFolha(d1);
      const parts = d1.split("-");
      const formatted = `${parts[2]}/${parts[1]}/${parts[0]}`;
      errFolha.style.display = "block";
      errFolha.innerHTML = `⚠️ <strong>Atencao ao periodo da folha</strong>: As duas datas precisam estar na <strong>mesma folha</strong>.<br>Como voce escolheu dia <strong>${formatted}</strong>, a data de pagamento <strong>deve</strong> ser entre <strong>${interval}</strong>.`;
      valid = false;
    }

    return valid;
  }

  function validarFolhaFechada(dateId) {
    const dateInput = document.getElementById(dateId);
    const errorDiv = document.getElementById(`e_folha_fechada_${dateId.split("_")[1]}`);
    errorDiv.style.display = "none";

    if (!dateInput.value) return true;

    const selectedDate = new Date(`${dateInput.value}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let startOfCurrentPeriod;
    if (today.getDate() >= 22) {
      startOfCurrentPeriod = new Date(today.getFullYear(), today.getMonth(), 22);
    } else {
      startOfCurrentPeriod = new Date(today.getFullYear(), today.getMonth() - 1, 22);
    }

    if (selectedDate < startOfCurrentPeriod) {
      errorDiv.innerHTML = "❌ <strong>Folha encerrada:</strong> A data escolhida pertence a uma folha de pagamento ja encerrada.";
      errorDiv.style.display = "block";
      return false;
    }

    return true;
  }

  function validarEscala(dateId) {
    if (dateId !== "data_folga") {
      const errDiv = document.getElementById("e_turma_pagamento");
      if (errDiv) errDiv.style.display = "none";
      return true;
    }

    const person = getUniquePerson("re_sol");
    if (!person || person.rotationCode === undefined || person.rotationCode === null) return true;

    const rotationCode = Number(person.rotationCode);
    let worksEven;

    if (rotationCode === 2) worksEven = true;
    else if (rotationCode === 1) worksEven = false;
    else return true;

    const dateInput = document.getElementById(dateId);
    if (!dateInput.value) return true;

    const targetDate = new Date(`${dateInput.value}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayIsEven = today.getDate() % 2 === 0;
    const todayIsWork = worksEven ? todayIsEven : !todayIsEven;
    const diffDays = Math.floor((targetDate - today) / (1000 * 60 * 60 * 24));
    const targetIsWork = diffDays % 2 === 0 ? todayIsWork : !todayIsWork;

    const errDiv = document.getElementById("e_turma_folga");
    if (targetIsWork) {
      errDiv.style.display = "block";
      errDiv.innerHTML = "⚠️ <strong>Data invalida</strong><br>Nao e possivel solicitar troca neste dia, pois voce esta escalado para trabalhar.";
      return false;
    }

    errDiv.style.display = "none";
    return true;
  }

  function syncManual(id) {
    const txt = document.getElementById(`${id}_txt`);
    let value = txt.value.replace(/\D/g, "");

    if (value.length > 2) value = `${value.slice(0, 2)}/${value.slice(2)}`;
    if (value.length > 5) value = `${value.slice(0, 5)}/${value.slice(5)}`;
    txt.value = value;

    if (value.length === 10) {
      const parts = value.split("/");
      const iso = `${parts[2]}-${parts[1]}-${parts[0]}`;
      if (!Number.isNaN(Date.parse(iso))) {
        document.getElementById(id).value = iso;
        validarTroca();
        validarFolhaFechada(id);
        validarEscala(id);
      }
    }
  }

  function syncPicker(id) {
    const parts = document.getElementById(id).value.split("-");
    if (parts.length !== 3) return;

    document.getElementById(`${id}_txt`).value = `${parts[2]}/${parts[1]}/${parts[0]}`;
    validarTroca();
    validarFolhaFechada(id);
    validarEscala(id);
  }

  function collectErrorsForStep(step) {
    const errors = [];
    const requesterEntry = findPersonEntryByInput("re_sol");
    const substituteEntry = findPersonEntryByInput("re_sub");
    const requester = requesterEntry && requesterEntry.type === "single" ? requesterEntry.person : null;
    const substitute = substituteEntry && substituteEntry.type === "single" ? substituteEntry.person : null;

    if (step === 2) {
      if (!requesterEntry || requesterEntry.type !== "single") errors.push("• RE do solicitante nao encontrado ou ambiguo.");
      else if (requester.blocked) errors.push(`• Solicitante bloqueado na Nexti (${requester.statusLabel}).`);
      if (!document.getElementById("unidade_troca").value) errors.push("• Selecione a Unidade.");
      if (!document.getElementById("data_folga").value) errors.push("• Informe a data da sua folga.");
      if (!validarFolhaFechada("data_folga")) errors.push("• A data da folga pertence a uma folha encerrada.");
      if (!validarEscala("data_folga")) errors.push("• Data da folga invalida para sua turma.");
    }

    if (step === 3) {
      if (!substituteEntry || substituteEntry.type !== "single") errors.push("• RE do substituto nao encontrado ou ambiguo.");
      else if (substitute.blocked) errors.push(`• Substituto bloqueado na Nexti (${substitute.statusLabel}).`);
      if (!validarMesmoRE()) errors.push("• Voce nao pode trocar com voce mesmo.");
      else if (!validarMesmaTurma()) errors.push("• Troca invalida: colaboradores da mesma turma.");
      if (!document.getElementById("data_pagamento").value) errors.push("• Informe a data de pagamento da troca.");
      if (!validarFolhaFechada("data_pagamento")) errors.push("• A data de pagamento pertence a uma folha encerrada.");
      if (!validarTroca()) errors.push("• Problemas com as datas informadas.");
      if (document.getElementById("motivo_troca").value.trim().length < 5) errors.push("• Informe o motivo da troca.");
    }

    return errors;
  }

  function buildSummaryHtml() {
    return `
                📌 <b>Solicitante:</b> ${escapeHtml(document.getElementById("nome_sol").value)}<br>
                🏢 <b>Unidade:</b> ${escapeHtml(document.getElementById("unidade_troca").value)}<br>
                🤝 <b>Substituto:</b> ${escapeHtml(document.getElementById("nome_sub").value)}<br>
                🗓️ <b>Folga:</b> ${escapeHtml(document.getElementById("data_folga").value.split("-").reverse().join("/"))}<br>
                🔁 <b>Pagamento:</b> ${escapeHtml(document.getElementById("data_pagamento").value.split("-").reverse().join("/"))}<br>
                💬 <b>Motivo:</b> ${escapeHtml(document.getElementById("motivo_troca").value)}
            `;
  }

  function nextStep(step) {
    const errors = collectErrorsForStep(step);
    if (errors.length > 0) {
      alert(`Nao e possivel avancar. Verifique os seguintes erros:\n\n${errors.join("\n")}`);
      return;
    }

    document.querySelectorAll(".step").forEach((element) => element.classList.remove("active"));
    document.querySelectorAll(".progress-bar span").forEach((element) => element.classList.remove("active"));

    document.getElementById(`step${step}`).classList.add("active");
    document.getElementById(`p${step}`).classList.add("active");

    if (step === 3) {
      document.getElementById("resumo_txt").innerHTML = buildSummaryHtml();
    }
  }

  function getSelectedWorkplace() {
    const value = document.getElementById("unidade_troca").value;
    return state.workplaces.find((workplace) => workplace.name === value) || null;
  }

  function buildSubmitPayload() {
    const requester = getUniquePerson("re_sol");
    const substitute = getUniquePerson("re_sub");
    const workplace = getSelectedWorkplace();

    return {
      group: state.group,
      requestType: "day_off_swap",
      requester: {
        id: requester ? requester.id : null,
        externalId: requester ? requester.externalId : null,
        enrolment: document.getElementById("re_sol").value,
        name: document.getElementById("nome_sol").value,
        scheduleId: requester ? requester.scheduleId : null,
        scheduleExternalId: requester ? requester.externalScheduleId : null,
        rotationId: requester ? requester.rotationId : null,
        rotationCode: requester ? requester.rotationCode : null,
        workplaceId: requester ? requester.workplaceId : null,
        workplaceExternalId: requester ? requester.workplaceExternalId : null,
        workplaceName: requester ? requester.workplaceName : null
      },
      substitute: {
        id: substitute ? substitute.id : null,
        externalId: substitute ? substitute.externalId : null,
        enrolment: document.getElementById("re_sub").value,
        name: document.getElementById("nome_sub").value,
        scheduleId: substitute ? substitute.scheduleId : null,
        scheduleExternalId: substitute ? substitute.externalScheduleId : null,
        rotationId: substitute ? substitute.rotationId : null,
        rotationCode: substitute ? substitute.rotationCode : null,
        workplaceId: substitute ? substitute.workplaceId : null,
        workplaceExternalId: substitute ? substitute.workplaceExternalId : null,
        workplaceName: substitute ? substitute.workplaceName : null
      },
      workplace: {
        id: workplace ? workplace.id : null,
        externalId: workplace ? workplace.externalId : null,
        name: document.getElementById("unidade_troca").value
      },
      workDate: document.getElementById("data_folga").value,
      offDate: document.getElementById("data_pagamento").value,
      reason: document.getElementById("motivo_troca").value.trim()
    };
  }

  function buildLocalWhatsappMessage() {
    return `*COMPROVANTE - SOLICITACAO DE TROCA*\n\n` +
      `👤 *Solicitante:* ${document.getElementById("nome_sol").value} (RE: ${document.getElementById("re_sol").value})\n` +
      `🗓️ *Data da Folga:* ${document.getElementById("data_folga_txt").value}\n` +
      `🏢 *Unidade:* ${document.getElementById("unidade_troca").value}\n\n` +
      `🤝 *Substituto:* ${document.getElementById("nome_sub").value} (RE: ${document.getElementById("re_sub").value})\n` +
      `🔁 *Data Pagamento:* ${document.getElementById("data_pagamento_txt").value}\n\n` +
      `💬 *Motivo:* ${document.getElementById("motivo_troca").value}`;
  }

  async function finalizar() {
    const button = document.getElementById("btn_confirmar");
    button.disabled = true;
    button.innerText = "Enviando...";

    try {
      const result = await state.provider.submitRequest(buildSubmitPayload());
      state.submitResult = result;

      document.getElementById("group_confirmacao").style.display = "none";
      document.getElementById("msg_sucesso").style.display = "block";
      document.getElementById("btn_whatsapp_final").style.display = "flex";
    } catch (error) {
      alert(error.message || "Nao foi possivel registrar a solicitacao.");
      button.disabled = false;
      button.innerText = "Confirmar Envio";
    }
  }

  function enviarWhatsapp() {
    const groupConfig = getGroupConfig(state.group);
    const targetPhone = state.submitResult && state.submitResult.whatsappTargetPhone
      ? state.submitResult.whatsappTargetPhone
      : groupConfig.whatsappNumber;
    const text = state.submitResult && state.submitResult.whatsappMessage
      ? state.submitResult.whatsappMessage
      : buildLocalWhatsappMessage();

    window.open(`https://api.whatsapp.com/send?phone=${targetPhone}&text=${encodeURIComponent(text)}`, "_blank");
  }

  function setLoadingState(visible, message) {
    const overlay = document.getElementById("loading-overlay");
    const label = document.getElementById("loading-message");
    const loader = overlay.querySelector(".loader");

    if (message) label.textContent = message;
    overlay.style.display = visible ? "flex" : "none";
    loader.style.display = visible ? "block" : "none";
  }

  function showFatalError(message) {
    const overlay = document.getElementById("loading-overlay");
    const label = document.getElementById("loading-message");
    const loader = overlay.querySelector(".loader");

    loader.style.display = "none";
    label.textContent = message;
    label.style.maxWidth = "320px";
    label.style.textAlign = "center";
    label.style.lineHeight = "1.5";
    overlay.style.display = "flex";
  }

  function applyGroupIdentity() {
    const logo = document.querySelector(".logo-img");
    const text = document.getElementById("grupo-selecionado-texto");
    const groupConfig = getGroupConfig(state.group);

    if (groupConfig.logo) logo.src = groupConfig.logo;
    if (groupConfig.label) text.textContent = groupConfig.label;
  }

  async function init() {
    state.group = localStorage.getItem("grupoSelecionado");
    if (!state.group) {
      window.location.replace("./gateway.html");
      return;
    }

    applyGroupIdentity();

    state.provider = new SupabaseProvider(getRuntimeConfig());
    if (!state.provider.isConfigured()) {
      showFatalError("Configure js/app-config.js com as credenciais publicas do Supabase para iniciar a integracao Nexti.");
      return;
    }

    setLoadingState(true, "Carregando base Nexti...");

    try {
      const directory = await state.provider.loadDirectory(state.group);
      processDirectory(directory);
      setLoadingState(false);
    } catch (error) {
      console.error(error);
      showFatalError(error.message || "Falha ao carregar dados da Nexti.");
    }
  }

  window.buscar = buscar;
  window.abrirCalendario = abrirCalendario;
  window.syncManual = syncManual;
  window.syncPicker = syncPicker;
  window.nextStep = nextStep;
  window.finalizar = finalizar;
  window.enviarWhatsapp = enviarWhatsapp;

  window.addEventListener("load", init);
})();
