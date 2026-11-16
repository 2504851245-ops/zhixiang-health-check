(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const views = {
    home: $("#homeView"),
    quiz: $("#quizView"),
    result: $("#resultView"),
  };
  const form = $("#quizForm");
  const panels = $$(".question-panel", form);
  const stepDots = $("#stepDots");
  const progressBar = $("#progressBar");
  const stepLabel = $("#stepLabel");
  const progressPercent = $("#progressPercent");
  const nextButton = $("#nextButton");
  const prevButton = $("#prevButton");
  const quizActionNote = $("#quizActionNote");
  const basicsError = $("#basicsError");
  const finishError = $("#finishError");
  const smokingDetails = $("#smokingDetails");
  const toast = $("#toast");
  const seniorToggle = $("#seniorToggle");

  const stepMeta = [
    { label: "基本信息", note: "预计还需 4 分钟" },
    { label: "健康现状", note: "预计还需 3 分钟" },
    { label: "家族与症状", note: "预计还需 2 分钟" },
    { label: "生活习惯", note: "预计还需 1 分钟" },
    { label: "筛查经历", note: "马上就好" },
  ];

  let currentStep = 0;
  let latestResult = null;
  let toastTimer = null;

  function syncSeniorMode(enabled, updateAddress = true) {
    document.documentElement.classList.toggle("senior-mode", enabled);
    seniorToggle.setAttribute("aria-pressed", String(enabled));
    seniorToggle.setAttribute(
      "title",
      enabled ? "切换回普通版" : "切换为中老年大字简单版"
    );
    seniorToggle.querySelector("span:last-child").textContent = enabled
      ? "普通版"
      : "大字版";

    if (!updateAddress) return;
    const address = new URL(window.location.href);
    if (enabled) {
      address.searchParams.set("mode", "senior");
    } else {
      address.searchParams.delete("mode");
    }
    address.hash = "";
    window.history.replaceState({}, "", address);
  }

  function showView(name) {
    Object.entries(views).forEach(([key, view]) => {
      view.classList.toggle("is-active", key === name);
      view.setAttribute("aria-hidden", String(key !== name));
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startQuiz() {
    showView("quiz");
    updateStepUI();
    window.setTimeout(() => $("#age").focus({ preventScroll: true }), 300);
  }

  function resetAssessment() {
    form.reset();
    currentStep = 0;
    latestResult = null;
    basicsError.textContent = "";
    finishError.textContent = "";
    smokingDetails.hidden = true;
    updateStepUI();
    showView("quiz");
  }

  function updateStepUI() {
    panels.forEach((panel, index) => {
      panel.classList.toggle("is-active", index === currentStep);
      panel.setAttribute("aria-hidden", String(index !== currentStep));
    });

    const percent = Math.round(((currentStep + 1) / panels.length) * 100);
    stepLabel.textContent = `第 ${currentStep + 1} 步，共 ${panels.length} 步`;
    progressPercent.textContent = `${percent}%`;
    progressBar.style.width = `${percent}%`;
    prevButton.hidden = currentStep === 0;
    nextButton.innerHTML =
      currentStep === panels.length - 1
        ? `生成体检清单
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12M11 5l5 5-5 5" /></svg>`
        : `继续
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12M11 5l5 5-5 5" /></svg>`;
    quizActionNote.textContent = stepMeta[currentStep]?.note || "";
    basicsError.textContent = "";
    finishError.textContent = "";

    stepDots.innerHTML = panels
      .map((_, index) => {
        const classes = [
          "step-dot",
          index === currentStep ? "is-active" : "",
          index < currentStep ? "is-complete" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return `<button class="${classes}" type="button" data-step="${index}" aria-label="前往第 ${index + 1} 步：${stepMeta[index].label}" ${index > currentStep ? 'aria-disabled="true"' : ""}></button>`;
      })
      .join("");
  }

  function validateBasics() {
    const age = Number(form.elements.age.value);
    const sex = form.querySelector('input[name="sex"]:checked');
    const optionalNumbers = [
      form.elements.height,
      form.elements.weight,
      form.elements.waist,
    ];

    if (!age || age < 18 || age > 100) {
      basicsError.textContent = "请填写 18–100 岁之间的年龄。";
      form.elements.age.focus();
      return false;
    }

    if (!sex) {
      basicsError.textContent = "请选择生理性别，用于生成相关筛查提示。";
      form.querySelector('input[name="sex"]').focus();
      return false;
    }

    const invalidOptional = optionalNumbers.find(
      (input) => input.value && !input.checkValidity()
    );
    if (invalidOptional) {
      basicsError.textContent = "请检查身高、体重或腰围是否填写在合理范围内。";
      invalidOptional.focus();
      return false;
    }

    basicsError.textContent = "";
    return true;
  }

  function validateFinalStep() {
    if (!$("#accuracyConsent").checked) {
      finishError.textContent = "请先确认你理解本工具的使用边界。";
      $("#accuracyConsent").focus();
      return false;
    }
    finishError.textContent = "";
    return true;
  }

  function goNext() {
    if (currentStep === 0 && !validateBasics()) return;
    if (currentStep === panels.length - 1) {
      if (!validateFinalStep()) return;
      latestResult = calculateResult(readForm());
      renderResult(latestResult);
      showView("result");
      return;
    }
    currentStep += 1;
    updateStepUI();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goPrevious() {
    if (currentStep === 0) {
      showView("home");
      return;
    }
    currentStep -= 1;
    updateStepUI();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function readForm() {
    const number = (name) => {
      const raw = form.elements[name]?.value;
      return raw === "" || raw === undefined ? null : Number(raw);
    };
    const checked = (name) =>
      $$(`input[name="${name}"]:checked`, form)
        .map((input) => input.value)
        .filter((value) => value !== "none");
    const selected = (name, fallback = "") =>
      form.querySelector(`input[name="${name}"]:checked`)?.value || fallback;

    return {
      age: number("age"),
      sex: selected("sex"),
      height: number("height"),
      weight: number("weight"),
      waist: number("waist"),
      conditions: checked("conditions"),
      bloodPressure: form.elements.bloodPressure.value,
      glucose: form.elements.glucose.value,
      family: checked("family"),
      symptoms: checked("symptoms"),
      smoking: selected("smoking", "never"),
      cigarettesPerDay: number("cigarettesPerDay"),
      smokingYears: number("smokingYears"),
      alcohol: form.elements.alcohol.value,
      exercise: form.elements.exercise.value,
      diet: checked("diet"),
      sleep: form.elements.sleep.value,
      exposure: form.elements.exposure.value,
      lastCheckup: selected("lastCheckup", "never"),
      priorTests: checked("priorTests"),
    };
  }

  function bmiFor(data) {
    if (!data.height || !data.weight) return null;
    const bmi = data.weight / (data.height / 100) ** 2;
    return Number.isFinite(bmi) && bmi >= 10 && bmi <= 80 ? bmi : null;
  }

  function packYearsFor(data) {
    if (!["current", "former"].includes(data.smoking)) return 0;
    if (!data.cigarettesPerDay || !data.smokingYears) return 0;
    return (data.cigarettesPerDay / 20) * data.smokingYears;
  }

  function calculateResult(data) {
    const factors = [];
    const bmi = bmiFor(data);
    const packYears = packYearsFor(data);
    const hasCondition = (...values) =>
      values.some((value) => data.conditions.includes(value));
    const hasFamily = (...values) =>
      values.some((value) => data.family.includes(value));

    if (hasCondition("cardiovascular", "hypertension", "diabetes", "lipids")) {
      const known = [];
      if (hasCondition("cardiovascular")) known.push("心脑血管疾病");
      if (hasCondition("hypertension")) known.push("高血压");
      if (hasCondition("diabetes")) known.push("糖尿病");
      if (hasCondition("lipids")) known.push("血脂异常");
      factors.push({
        category: "代谢与心血管",
        icon: "pulse",
        tone: "coral",
        level: "priority",
        levelLabel: "重点关注",
        title: "已有代谢或心血管线索",
        detail: `${known.join("、")}需要持续随访。体检重点是复查控制情况、靶器官风险和用药安全。`,
      });
    } else if (
      ["borderline", "high"].includes(data.bloodPressure) ||
      ["borderline", "high"].includes(data.glucose)
    ) {
      factors.push({
        category: "代谢与心血管",
        icon: "pulse",
        tone: "coral",
        level: "priority",
        levelLabel: "值得复查",
        title: "血压或血糖需要确认",
        detail: "你报告了偏高读数。单次结果不能确诊，建议规范复测，并由医生判断是否需要进一步评估。",
      });
    }

    if (bmi !== null && bmi >= 24) {
      factors.push({
        category: "体重与代谢",
        icon: "scale",
        tone: bmi >= 28 ? "coral" : "gold",
        level: bmi >= 28 ? "priority" : "watch",
        levelLabel: bmi >= 28 ? "重点关注" : "值得留意",
        title: `BMI 约 ${bmi.toFixed(1)}`,
        detail:
          bmi >= 28
            ? "BMI 处于肥胖范围。建议评估血压、血糖、血脂和脂肪肝风险，不采用极端减重方式。"
            : "BMI 处于超重范围。小幅、可持续的体重下降也可能改善代谢指标。",
      });
    }

    const waistHigh =
      data.waist &&
      ((data.sex === "male" && data.waist >= 90) ||
        (data.sex === "female" && data.waist >= 85));
    if (waistHigh) {
      factors.push({
        category: "腹型肥胖",
        icon: "waist",
        tone: "gold",
        level: "watch",
        levelLabel: "值得留意",
        title: "腰围提示中心性肥胖",
        detail: "中心性肥胖与糖脂代谢和心血管风险相关。体检时建议复查腰围，并关注血压与血脂。",
      });
    }

    if (["current", "former"].includes(data.smoking)) {
      const value =
        packYears >= 20
          ? `累计约 ${packYears.toFixed(0)} 包年`
          : "有吸烟或既往吸烟史";
      factors.push({
        category: "呼吸与心血管",
        icon: "lung",
        tone: "coral",
        level: data.smoking === "current" ? "priority" : "watch",
        levelLabel: data.smoking === "current" ? "优先改变" : "继续随访",
        title: data.smoking === "current" ? "目前仍在吸烟" : "曾有吸烟史",
        detail: `${value}。戒烟在任何年龄都有收益；是否做低剂量胸部 CT 需结合年龄、包年与医生评估。`,
      });
    } else if (data.smoking === "passive") {
      factors.push({
        category: "呼吸健康",
        icon: "wind",
        tone: "gold",
        level: "watch",
        levelLabel: "减少暴露",
        title: "长期接触二手烟",
        detail: "二手烟没有安全暴露水平。可优先改善家庭与工作环境，并在体检时说明暴露情况。",
      });
    }

    if (data.family.length) {
      const labels = [];
      if (hasFamily("cvd")) labels.push("早发心脑血管病");
      if (hasFamily("diabetes")) labels.push("糖尿病");
      if (hasFamily("gi-cancer")) labels.push("胃肠道肿瘤");
      if (hasFamily("breast-cancer")) labels.push("乳腺或卵巢癌");
      if (hasFamily("liver-cancer")) labels.push("肝病或肝癌");
      factors.push({
        category: "家族与遗传",
        icon: "family",
        tone: "gold",
        level: "watch",
        levelLabel: "影响筛查",
        title: "家族史会影响起始时间",
        detail: `你选择了${labels.join("、")}相关家族史。是否提前筛查应由医生结合患病年龄和亲属数量判断。`,
      });
    }

    if (hasCondition("liver") || hasFamily("liver-cancer")) {
      factors.push({
        category: "肝脏健康",
        icon: "liver",
        tone: "coral",
        level: "priority",
        levelLabel: "专科随访",
        title: "肝脏风险需要连续管理",
        detail: "慢性肝病或肝癌家族史人群通常需要规律复查。具体影像和化验频率遵循肝病专科建议。",
      });
    }

    if (hasCondition("kidney")) {
      factors.push({
        category: "肾脏保护",
        icon: "kidney",
        tone: "coral",
        level: "priority",
        levelLabel: "规律复查",
        title: "已有肾功能异常线索",
        detail: "体检时应关注 eGFR、尿白蛋白/肌酐比、血压和正在使用的药物，避免肾毒性药物。",
      });
    }

    if (hasCondition("respiratory") || data.exposure !== "none") {
      factors.push({
        category: "呼吸健康",
        icon: "wind",
        tone: "gold",
        level: "watch",
        levelLabel: "专科评估",
        title: "呼吸道或职业暴露线索",
        detail: "慢阻肺、哮喘或粉尘/化学暴露可能影响肺功能评估和肺癌筛查选择，请主动告知医生职业史。",
      });
    }

    if (
      data.exercise === "low" ||
      data.exercise === "unknown" ||
      data.alcohol === "often" ||
      data.diet.length ||
      data.sleep === "short" ||
      data.sleep === "poor"
    ) {
      const habits = [];
      if (data.exercise === "low" || data.exercise === "unknown") habits.push("活动不足");
      if (data.alcohol === "often") habits.push("饮酒频繁");
      if (data.diet.length) habits.push("饮食结构可改善");
      if (["short", "poor"].includes(data.sleep)) habits.push("睡眠不足或不稳");
      factors.push({
        category: "可改变因素",
        icon: "leaf",
        tone: "green",
        level: "watch",
        levelLabel: "今天可行动",
        title: "生活方式有改善空间",
        detail: `${habits.join("、")}。这些因素不会立刻导致疾病，但长期会影响血压、血糖、体重和睡眠。`,
      });
    }

    if (data.sleep === "snore") {
      factors.push({
        category: "睡眠健康",
        icon: "moon",
        tone: "gold",
        level: "watch",
        levelLabel: "建议评估",
        title: "打鼾并伴白天困倦",
        detail: "建议睡眠门诊评估是否存在睡眠呼吸暂停。体检时也可主动说明夜间憋醒、晨起头痛等情况。",
      });
    }

    if (data.symptoms.length) {
      factors.unshift({
        category: "近期症状",
        icon: "alert",
        tone: "danger",
        level: "priority",
        levelLabel: "先就医",
        title: "有症状不应等待常规体检",
        detail: "你选择了近期异常信号。请先让医生评估症状，再决定检查项目；急性胸痛或疑似脑卒中请立即急救。",
      });
    } else if (data.age >= 40) {
      factors.push({
        category: "年龄相关筛查",
        icon: "calendar",
        tone: "green",
        level: "screening",
        levelLabel: "按龄安排",
        title: "进入重点筛查年龄",
        detail: "40 岁后需要更主动地评估心血管风险及适合的癌症筛查，但不必把昂贵项目全部纳入常规体检。",
      });
    }

    if (data.lastCheckup === "old" || data.lastCheckup === "never") {
      factors.push({
        category: "健康档案",
        icon: "file",
        tone: "green",
        level: "screening",
        levelLabel: "建立基线",
        title: "缺少近期的健康基线",
        detail: "建议整理既往报告并完成一次基础体检。建立连续记录比一次“大而全”的检查更有价值。",
      });
    }

    const emergency = data.symptoms.length > 0;
    const priorityCount = factors.filter((factor) => factor.level === "priority").length;
    const status =
      emergency || priorityCount > 0 || factors.length >= 5
        ? "priority"
        : factors.length >= 2
          ? "planned"
          : "routine";

    return {
      data,
      bmi,
      packYears,
      factors,
      emergency,
      status,
      checkupCards: buildCheckupCards(data, {
        bmi,
        packYears,
        hasCondition,
        hasFamily,
      }),
      actions: buildActions(data, factors, { bmi, packYears, hasCondition }),
      timeline: buildTimeline(data, emergency, status),
      doctorQuestions: buildDoctorQuestions(data, factors, {
        bmi,
        packYears,
        hasCondition,
        hasFamily,
      }),
    };
  }

  function buildCheckupCards(data, context) {
    const { bmi, packYears, hasCondition, hasFamily } = context;
    const cards = [];
    const riskLabs = [];

    if (
      hasCondition("hypertension", "diabetes", "lipids", "cardiovascular") ||
      ["borderline", "high"].includes(data.bloodPressure) ||
      ["borderline", "high"].includes(data.glucose)
    ) {
      riskLabs.push({
        title: "复查血压与血糖",
        detail:
          "规范测量血压；按医生建议复查空腹血糖和 HbA1c，必要时做口服葡萄糖耐量试验。不要凭单次读数自行诊断。",
      });
    }
    if (hasCondition("diabetes", "hypertension", "kidney")) {
      riskLabs.push({
        title: "估算肾小球滤过率与尿白蛋白/肌酐比",
        detail: "用于发现早期肾脏损伤，尤其适合糖尿病、高血压或已有肾病线索的人。",
      });
    }
    if (
      hasCondition("lipids", "cardiovascular") ||
      data.family.includes("cvd") ||
      data.smoking === "current"
    ) {
      riskLabs.push({
        title: "空腹血脂与总体心血管风险",
        detail: "医生会结合年龄、血压、血脂、吸烟和糖尿病等综合判断，而不是只看一个指标。",
      });
    }
    if (bmi !== null && bmi >= 24) {
      riskLabs.push({
        title: "代谢相关评估",
        detail: "复查腰围、血压、血糖、血脂，并结合腹部超声评估脂肪肝风险。具体项目由医生决定。",
      });
    }

    if (riskLabs.length) {
      cards.push({
        title: "代谢与心脑血管重点",
        caption: "根据你的现状，把已知指标复查和控制情况放在前面。",
        featured: true,
        items: riskLabs,
        note: "已确诊疾病请按原专科随访计划执行，体检不能替代疾病管理。",
      });
    }

    if (
      hasCondition("liver") ||
      data.family.includes("liver-cancer") ||
      data.conditions.includes("liver")
    ) {
      cards.push({
        title: "肝脏专项随访",
        caption: "肝脏风险通常需要连续记录，而不是只做一次检查。",
        featured: true,
        items: [
          {
            title: "肝功能与乙肝/丙肝状态",
            detail: "如感染状态或既往结果不清楚，可由医生评估是否需要乙肝表面抗原、丙肝抗体等检查。",
          },
          {
            title: "肝脏超声与甲胎蛋白的复查计划",
            detail: "慢性乙肝、丙肝或肝硬化人群的复查频率不同，请遵循肝病专科对影像和化验的安排。",
          },
          {
            title: "脂肪肝与代谢风险",
            detail: "脂肪肝不是“只有胖人才会有”。建议同步关注腰围、血糖、血脂和饮酒情况。",
          },
        ],
      });
    }

    if (
      hasCondition("respiratory") ||
      data.exposure !== "none" ||
      data.smoking !== "never"
    ) {
      const respiratoryItems = [
        {
          title: "肺功能检查",
          detail: "如有长期咳嗽、喘息、活动后气短或长期吸烟，可与呼吸科讨论肺功能和症状评估。",
        },
      ];
      if (
        data.age >= 50 &&
        data.age <= 74 &&
        (packYears >= 20 || data.smoking === "current" || data.exposure === "dust")
      ) {
        respiratoryItems.unshift({
          title: "低剂量胸部 CT（与医生讨论）",
          detail:
            packYears >= 20
              ? `按你填写的信息估算约 ${packYears.toFixed(0)} 包年，建议与医生讨论肺癌筛查。是否检查还需结合完整吸烟史和其他风险。`
              : "你属于需要进一步评估的高风险情况。是否筛查需由医生结合完整吸烟史、职业暴露和当地规范判断。",
        });
      }
      cards.push({
        title: "呼吸系统评估",
        caption: "主动告知医生吸烟史、二手烟和职业暴露，有助于选择合适项目。",
        items: respiratoryItems,
      });
    }

    const screeningItems = [];
    if (data.age >= 45 || (data.age >= 40 && hasFamily("gi-cancer"))) {
      screeningItems.push({
        title: "结直肠癌筛查方案（与医生讨论）",
        detail: hasFamily("gi-cancer")
          ? "有结直肠癌家族史时，筛查可能需要提前并采用更直接的方式。请告知医生亲属患病年龄。"
          : "可选粪便免疫化学检测或结肠镜等路径；间隔取决于既往结果和医生评估。",
      });
    }
    if (
      data.age >= 40 &&
      (hasFamily("gi-cancer") || data.diet.includes("salt"))
    ) {
      screeningItems.push({
        title: "幽门螺杆菌与胃癌风险评估（与医生讨论）",
        detail: "胃癌筛查需结合地区风险、家族史、幽门螺杆菌状态和既往胃镜结果，不建议自行频繁做胃镜。",
      });
    }
    if (
      data.sex === "female" &&
      data.age >= 25 &&
      data.age <= 64
    ) {
      screeningItems.push({
        title: "宫颈癌筛查到期确认",
        detail:
          "可根据当地规范选择 HPV 检测或细胞学检查。具体间隔取决于年龄、既往结果和筛查方式。",
      });
    }
    if (data.sex === "female" && data.age >= 40) {
      screeningItems.push({
        title: "乳腺影像筛查（与医生讨论）",
        detail: "乳腺超声或钼靶的选择与年龄、乳腺致密度和个人风险有关，通常建议在正规机构按规范进行。",
      });
    }
    if (data.sex === "male" && data.age >= 50) {
      screeningItems.push({
        title: "前列腺风险沟通（共同决策）",
        detail: "可与医生讨论 PSA 检测的收益、假阳性和后续检查风险，而不是把 PSA 当作单一诊断工具。",
      });
    }
    if (
      (data.sex === "female" && data.age >= 65) ||
      (data.sex === "male" && data.age >= 70) ||
      (data.sex === "female" && data.age >= 50 && data.family.includes("cvd"))
    ) {
      screeningItems.push({
        title: "骨密度评估",
        detail: "可讨论双能 X 线吸收法（DXA）检查，并结合既往骨折、用药与家族史判断。",
      });
    }
    if (
      data.age >= 50 &&
      data.age <= 74 &&
      (packYears >= 20 || data.smoking === "current")
    ) {
      screeningItems.push({
        title: "低剂量胸部 CT 到期确认",
        detail: "若从未做过且属于高风险人群，可与呼吸科或体检医生讨论肺癌筛查及适宜频率。",
      });
    }
    if (data.family.includes("breast-cancer") && data.sex === "female") {
      screeningItems.push({
        title: "遗传风险与提前筛查咨询",
        detail: "如多位亲属患病、较年轻时发病或存在已知遗传变异，可咨询乳腺专科或遗传门诊。",
      });
    }

    if (screeningItems.length) {
      cards.push({
        title: "按年龄与风险安排筛查",
        caption: "先确认哪些已经做过、何时到期，再决定是否加项。",
        items: screeningItems,
        note: "不建议把肿瘤标志物或全身 CT 作为所有人的常规筛查。项目越多不等于越安全。",
      });
    }

    const baseDetails =
      data.age >= 30
        ? "身高、体重、腰围、血压；静息心电图可作为心血管基线，由医生结合症状决定。"
        : "身高、体重、腰围、血压。心电图并非所有年轻人都需要，除非有症状或医生建议。";
    cards.unshift({
      title: "基础健康档案",
      caption: "先完成能长期比较的基础项目，带上既往报告避免重复检查。",
      featured: true,
      items: [
        {
          title: "体格检查与生命体征",
          detail: baseDetails,
        },
        {
          title: "基础实验室检查",
          detail:
            "血常规、尿常规、空腹血糖、血脂、肝功能和肾功能。具体组合与是否需要空腹，以体检机构要求为准。",
        },
        {
          title: "腹部超声与其他基线",
          detail:
            "腹部超声可评估肝胆胰脾肾。甲状腺、颈动脉等项目应根据症状、查体和医生建议选择。",
        },
        {
          title: "口腔、视力与心理健康",
          detail: "这些常被忽略，却直接影响日常生活。可在基础体检时一并完成简短筛查。",
        },
      ],
      note:
        data.lastCheckup === "1"
          ? "你近期做过体检。请带上次报告，让医生判断哪些需要复查、哪些可以省略。"
          : "如果不知道上次结果，优先向原体检机构调取报告。",
    });

    return cards;
  }

  function buildActions(data, factors, context) {
    const { bmi } = context;
    const actions = [];

    if (data.symptoms.length) {
      actions.push({
        title: "先处理近期异常症状",
        detail: "若胸痛、呼吸困难或疑似脑卒中正在发生，立即拨打 120；不要等到预约体检。",
        badge: "现在",
      });
    }

    if (data.lastCheckup === "old" || data.lastCheckup === "never") {
      actions.push({
        title: "预约一次基础体检",
        detail: "选择正规医疗机构，带上既往报告和用药清单；先建立可以连续比较的基线。",
        badge: "30 天",
      });
    }

    if (data.smoking === "current") {
      actions.push({
        title: "设定戒烟日，寻求专业帮助",
        detail: "戒烟门诊、行为支持和规范药物比单靠意志更有效。避免用电子烟替代卷烟。",
        badge: "本周",
      });
    }

    if (data.exercise === "low" || data.exercise === "unknown") {
      actions.push({
        title: "从每周 3 次快走开始",
        detail: "逐步接近每周 150 分钟中等强度活动，并加入每周 2 次力量训练；按自身情况量力而行。",
        badge: "持续",
      });
    }

    if (data.alcohol === "often" || data.alcohol === "weekly") {
      actions.push({
        title: "记录一周饮酒量",
        detail: "减少饮酒频率和单次量。若饮酒已影响睡眠、工作或难以停止，可向医生寻求帮助。",
        badge: "7 天",
      });
    }

    if (data.diet.length) {
      actions.push({
        title: "替换一个高频饮食选择",
        detail:
          data.diet.includes("salt")
            ? "先减少酱料、腌制品和外卖汤汁，用香辛料代替部分盐；同时增加蔬菜和全谷物。"
            : "每餐增加一份蔬菜，用白水替代含糖饮料，并减少加工肉频率。",
        badge: "持续",
      });
    }

    if (["borderline", "high"].includes(data.bloodPressure) || data.conditions.includes("hypertension")) {
      actions.push({
        title: "做 7 天家庭血压记录",
        detail: "使用经过验证的上臂式血压计。早晚规范测量并记录，携带记录给医生判断。",
        badge: "7 天",
      });
    }

    if (data.sleep === "snore") {
      actions.push({
        title: "记录睡眠与白天困倦",
        detail: "记录打鼾、憋醒和晨起头痛，预约睡眠门诊或向全科医生说明情况。",
        badge: "本周",
      });
    }

    if (bmi !== null && bmi >= 24 && !actions.some((action) => action.detail.includes("快走"))) {
      actions.push({
        title: "设一个小而可持续的体重目标",
        detail: "先以 3–6 个月小幅减重为目标，优先增加日常步行、减少含糖饮料和过量精制主食。",
        badge: "持续",
      });
    }

    if (!actions.length) {
      actions.push(
        {
          title: "保持每周规律活动",
          detail: "维持每周至少 150 分钟中等强度活动和 2 次力量训练，久坐时每小时起身活动。",
          badge: "持续",
        },
        {
          title: "建立个人健康档案",
          detail: "保留体检报告、疫苗记录和用药清单；下次就医时能减少重复检查与信息遗漏。",
          badge: "30 天",
        }
      );
    }

    return actions.slice(0, 6);
  }

  function buildTimeline(data, emergency, status) {
    if (emergency) {
      return [
        {
          time: "现在",
          title: "优先处理警示症状",
          detail: "急性胸痛、严重呼吸困难或疑似脑卒中请立即拨打 120。其他异常也应尽快联系正规医疗机构。",
        },
        {
          time: "就医后",
          title: "带着本次清单沟通",
          detail: "向医生说明症状何时开始、持续多久、是否加重，以及既往疾病、用药和家族史。",
        },
        {
          time: "稳定后",
          title: "建立长期随访",
          detail: "症状缓解或排除急症后，再按医生意见安排常规体检与慢病筛查。",
        },
      ];
    }

    if (status === "priority") {
      return [
        {
          time: "本周",
          title: "选择机构并准备资料",
          detail: "整理近年的体检报告、正在使用的药物和疫苗记录，预约正规医疗机构的全科或健康管理门诊。",
        },
        {
          time: "1–3 个月",
          title: "完成重点检查",
          detail: "把本次生成的重点项目交给医生确认，按建议完成复查；出现新症状时提前就医。",
        },
        {
          time: "长期",
          title: "连续记录变化",
          detail: "根据结果确定复查间隔。血压、血糖、血脂等指标看趋势比看单次结果更有意义。",
        },
      ];
    }

    return [
      {
        time: "30 天内",
        title: "预约基础体检",
        detail: "结合最近检查时间与预算，预约适合自己的基础项目；与医生确认是否有需要增加的重点。",
      },
      {
        time: "3–6 个月",
        title: "复查异常或待确认指标",
        detail: "如果体检出现异常，按医生给出的时间复查。不要仅凭报告自行用药或忽略异常。",
      },
      {
        time: "每年",
        title: "更新健康档案",
        detail: "更新体重、腰围、血压、用药和疫苗记录，并按年龄与风险确认下一次筛查时间。",
      },
    ];
  }

  function buildDoctorQuestions(data, factors, context) {
    const { bmi, packYears, hasFamily } = context;
    const questions = [
      `结合我 ${data.age} 岁的年龄、${data.sex === "female" ? "女性" : "男性"}生理特点和既往情况，这份清单里的项目哪些真正适合我？`,
      "我最近一次体检报告中，有没有需要复查或连续随访的异常？哪些项目可以暂时不做？",
      "我目前是否需要评估心血管总体风险？如果需要，除了血压和血脂，还应补充哪些信息？",
      "我的疫苗接种、口腔健康、视力、睡眠和心理健康方面，是否有适合现在完成的筛查？",
    ];

    if (data.family.length) {
      questions.push("我的家族史是否需要提前筛查、转诊遗传咨询，或对亲属进行相关检查？");
    }
    if (data.smoking !== "never") {
      questions.push(
        packYears >= 20
          ? `我的吸烟史约为 ${packYears.toFixed(0)} 包年，是否达到肺癌筛查条件？如果达到，筛查频率是多少？`
          : "我的吸烟史和职业暴露是否影响肺功能或肺癌筛查安排？"
      );
    }
    if (bmi !== null && bmi >= 24) {
      questions.push("结合我的 BMI、腰围和代谢指标，适合怎样设定减重与运动目标？");
    }
    if (
      data.conditions.some((item) =>
        ["hypertension", "diabetes", "lipids", "cardiovascular"].includes(item)
      )
    ) {
      questions.push("本次体检是否需要同时评估心、脑、肾、眼底等靶器官风险？");
    }
    if (data.symptoms.length) {
      questions.push("这些近期症状需要先做哪些紧急评估？在症状未明确前，哪些体检项目应暂缓？");
    }

    return questions.slice(0, 6);
  }

  const icons = {
    pulse:
      '<svg viewBox="0 0 24 24"><path d="M3 12h4l2-5 3.5 10 2.5-5h6"/></svg>',
    scale:
      '<svg viewBox="0 0 24 24"><path d="M12 4v16M6 20h12M7 8h10M7 8l-3 6h6L7 8ZM17 8l-3 6h6l-3-6Z"/></svg>',
    waist:
      '<svg viewBox="0 0 24 24"><path d="M6 4c0 5 2 7 6 7s6-2 6-7M4 20c0-5 3-9 8-9s8 4 8 9M8 14h8"/></svg>',
    lung:
      '<svg viewBox="0 0 24 24"><path d="M11 4v10c0 3-1 6-4 6-2 0-3-2-3-4 0-3 1-7 4-9M13 4v10c0 3 1 6 4 6 2 0 3-2 3-4 0-3-1-7-4-9"/></svg>',
    wind:
      '<svg viewBox="0 0 24 24"><path d="M3 8h11c3 0 3-4 0-4-1 0-2 .5-2 1.5M3 12h16c3 0 3 4 0 4-1 0-2-.5-2-1.5M3 16h8"/></svg>',
    family:
      '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-4 2-7 6-7s6 3 6 7M14 14c4 0 6 2.5 6 6"/></svg>',
    liver:
      '<svg viewBox="0 0 24 24"><path d="M4 15c3-8 8-9 16-7-1 8-8 12-16 10ZM9 18c2-5 4-7 8-9"/></svg>',
    kidney:
      '<svg viewBox="0 0 24 24"><path d="M9 4c-5 0-6 7-1 10 3 2 4-1 4-4V7c0-2-1-3-3-3ZM17 4c5 0 5 9 0 12-2 1-2-2-2-5V7c0-2 0-3 2-3Z"/></svg>',
    leaf:
      '<svg viewBox="0 0 24 24"><path d="M4 20C3 10 9 4 20 4c0 10-6 16-16 16ZM4 20c3-6 7-9 12-11"/></svg>',
    moon:
      '<svg viewBox="0 0 24 24"><path d="M20 15A8 8 0 0 1 9 4a8 8 0 1 0 11 11Z"/></svg>',
    alert:
      '<svg viewBox="0 0 24 24"><path d="M12 3 2 21h20L12 3ZM12 9v5M12 17.5v.2"/></svg>',
    calendar:
      '<svg viewBox="0 0 24 24"><path d="M4 6h16v14H4zM8 3v6M16 3v6M4 11h16M8 15h3M14 15h2"/></svg>',
    file:
      '<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6zM14 3v5h4M9 13h6M9 17h6"/></svg>',
  };

  function toneColors(tone) {
    return {
      coral: ["#fbe7df", "#b5573d"],
      gold: ["#f7ecd8", "#8b672c"],
      green: ["#ddf1e4", "#1f5b49"],
      danger: ["#fadfd5", "#af4532"],
    }[tone] || ["#edf0eb", "#6b7f79"];
  }

  function renderResult(result) {
    const { data, factors, emergency, status, bmi, checkupCards, actions, timeline } =
      result;
    $("#resultDate").textContent = new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date());

    const copy = {
      priority: {
        eyebrow: "建议近期安排",
        title: "把关键项目先查清楚，<br>再决定下一步。",
        summary: `我们在你的回答中识别出 ${factors.length} 个值得关注的线索。建议先与医生确认重点项目和复查时间，不需要一次性把检查做全。`,
        label: "优先安排",
      },
      planned: {
        eyebrow: "建议按计划体检",
        title: "把模糊的担心，<br>变成清楚的计划。",
        summary: `你的整体线索为 ${factors.length} 项。优先完成基础体检，再根据年龄、家族史和既往结果补充筛查。`,
        label: "按计划进行",
      },
      routine: {
        eyebrow: "建议保持常规随访",
        title: "目前没有突出的重要线索，<br>继续保持。",
        summary: `本次回答没有发现明显的额外风险线索。仍建议保留基础体检与连续记录，因为“没有风险线索”不等于“不需要体检”。`,
        label: "保持好习惯",
      },
    }[status];

    if (emergency) {
      copy.eyebrow = "请先关注近期症状";
      copy.title = "先处理眼前的信号，<br>体检可以稍后再规划。";
      copy.summary = `你选择了需要尽快就医的症状。请先让医生评估这些症状；若正在出现急性胸痛、严重呼吸困难或疑似脑卒中，请立即拨打 120。`;
      copy.label = "先就医";
    }

    $("#resultEyebrow").textContent = copy.eyebrow;
    $("#resultTitle").innerHTML = copy.title;
    $("#resultSummary").textContent = copy.summary;
    $("#attentionCount").textContent = factors.length;
    $("#attentionLabel").textContent = copy.label;
    $("#emergencyAlert").hidden = !emergency;

    const gaugePercent = Math.min(factors.length / 10, 1) * 100;
    $("#attentionGauge").style.background = `conic-gradient(#76c49a 0 ${gaugePercent}%, rgba(255, 255, 255, 0.09) ${gaugePercent}% 100%)`;

    const tagValues = [
      `${data.age} 岁`,
      data.sex === "female" ? "女性" : "男性",
      bmi !== null ? `BMI ${bmi.toFixed(1)}` : null,
      ...new Set(factors.map((factor) => factor.category)),
    ].filter(Boolean);
    $("#resultTags").innerHTML = tagValues
      .slice(0, 5)
      .map((tag) => `<span>${tag}</span>`)
      .join("");
    $("#seniorTopActions").innerHTML = `
      <strong>先做这三件事</strong>
      ${actions
        .slice(0, 3)
        .map(
          (action, index) => `
            <div class="senior-top-action">
              <span>${index + 1}</span>
              <div>${action.title}</div>
            </div>
          `
        )
        .join("")}
    `;

    renderFactors(factors);
    renderCheckupCards(checkupCards);
    renderActions(actions);
    renderTimeline(timeline);

    $("#doctorQuestions").innerHTML = result.doctorQuestions
      .map((question) => `<li>${question}</li>`)
      .join("");
  }

  function renderFactors(factors) {
    if (!factors.length) {
      $("#riskFactors").innerHTML = `
        <article class="factor-card">
          <div class="factor-card-head">
            <span class="factor-card-icon" style="color:#1f5b49;background:#ddf1e4">
              <svg viewBox="0 0 24 24"><path d="m4 12 5 5L20 6"/></svg>
            </span>
            <span class="factor-level">正向线索</span>
          </div>
          <h3>基础情况较平稳</h3>
          <p>本次没有录入明显异常。继续保持规律活动、均衡饮食和不吸烟，并用年度体检跟踪变化。</p>
        </article>
        <article class="factor-card">
          <div class="factor-card-head">
            <span class="factor-card-icon" style="color:#8b672c;background:#f7ecd8">
              <svg viewBox="0 0 24 24"><path d="M12 3v18M5 8l7-5 7 5M7 13h10l-2.5 7h-5z"/></svg>
            </span>
            <span class="factor-level">基础项目</span>
          </div>
          <h3>仍需要健康基线</h3>
          <p>没有症状并不等于所有指标正常。血压、血脂、血糖及肝肾功能仍值得按年龄规律检查。</p>
        </article>
      `;
      return;
    }

    $("#riskFactors").innerHTML = factors
      .slice(0, 9)
      .map((factor) => {
        const [background, color] = toneColors(factor.tone);
        return `
          <article class="factor-card">
            <div class="factor-card-head">
              <span class="factor-card-icon" style="color:${color};background:${background}">
                ${icons[factor.icon] || icons.file}
              </span>
              <span class="factor-level">${factor.levelLabel}</span>
            </div>
            <h3>${factor.title}</h3>
            <p>${factor.detail}</p>
          </article>
        `;
      })
      .join("");
  }

  function renderCheckupCards(cards) {
    $("#checkupGrid").innerHTML = cards
      .map(
        (card, index) => `
          <article class="checkup-card ${card.featured ? "featured" : ""}">
            <div class="checkup-card-head">
              <span class="checkup-card-index">${String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>${card.title}</h3>
                <p>${card.caption}</p>
              </div>
            </div>
            <div class="checkup-items">
              ${card.items
                .map(
                  (item) => `
                    <div class="checkup-item">
                      <span class="checkup-bullet">✓</span>
                      <div>
                        <strong>${item.title}</strong>
                        <p>${item.detail}</p>
                      </div>
                    </div>
                  `
                )
                .join("")}
            </div>
            ${
              card.note
                ? `<div class="checkup-card-note">${card.note}</div>`
                : ""
            }
          </article>
        `
      )
      .join("");
  }

  function renderActions(actions) {
    $("#actionList").innerHTML = actions
      .map(
        (action, index) => `
          <article class="action-item">
            <span>${String(index + 1).padStart(2, "0")}</span>
            <div>
              <strong>${action.title}</strong>
              <p>${action.detail}</p>
            </div>
            <em>${action.badge}</em>
          </article>
        `
      )
      .join("");
  }

  function renderTimeline(items) {
    $("#followUpTimeline").innerHTML = items
      .map(
        (item) => `
          <article class="timeline-item">
            <span class="timeline-time">${item.time}</span>
            <h3>${item.title}</h3>
            <p>${item.detail}</p>
          </article>
        `
      )
      .join("");
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
  }

  async function copySiteAddress() {
    const address = window.location.href.split("#")[0];
    if (window.location.protocol === "file:") {
      showToast("当前是本地文件；部署到网站后，此按钮会复制分享地址");
      return;
    }

    try {
      await navigator.clipboard.writeText(address);
      showToast("网站地址已复制，不包含你的健康答案");
    } catch {
      const helper = document.createElement("textarea");
      helper.value = address;
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.appendChild(helper);
      helper.select();
      document.execCommand("copy");
      helper.remove();
      showToast("网站地址已复制，不包含你的健康答案");
    }
  }

  $$("[data-start], #startButton").forEach((button) => {
    button.addEventListener("click", startQuiz);
  });

  $$("[data-go-home]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      showView("home");
    });
  });

  nextButton.addEventListener("click", goNext);
  prevButton.addEventListener("click", goPrevious);
  $("#quizExitButton").addEventListener("click", () => showView("home"));
  $("#editAnswersButton").addEventListener("click", () => {
    showView("quiz");
    currentStep = panels.length - 1;
    updateStepUI();
  });
  $("#restartButton").addEventListener("click", resetAssessment);
  $("#printButton").addEventListener("click", () => window.print());
  $("#copyButton").addEventListener("click", copySiteAddress);
  seniorToggle.addEventListener("click", () => {
    syncSeniorMode(!document.documentElement.classList.contains("senior-mode"));
  });

  form.addEventListener("submit", (event) => event.preventDefault());

  form.addEventListener("change", (event) => {
    const input = event.target;
    if (input.dataset.noneGroup && input.checked) {
      const isNone = input.value === "none";
      $$(`input[name="${input.name}"]`, form).forEach((sibling) => {
        if (sibling === input) return;
        if (isNone || sibling.value === "none") sibling.checked = false;
      });
    }

    if (input.name === "smoking") {
      const showSmoking =
        input.value === "current" || input.value === "former";
      smokingDetails.hidden = !showSmoking;
      if (!showSmoking) {
        form.elements.cigarettesPerDay.value = "";
        form.elements.smokingYears.value = "";
      }
    }
  });

  stepDots.addEventListener("click", (event) => {
    const button = event.target.closest("[data-step]");
    if (!button || button.getAttribute("aria-disabled") === "true") return;
    if (currentStep === 0 && !validateBasics()) return;
    currentStep = Number(button.dataset.step);
    updateStepUI();
  });

  document.addEventListener("keydown", (event) => {
    if (!views.quiz.classList.contains("is-active")) return;
    if (
      event.key === "Enter" &&
      event.target.matches('input[type="number"], input[type="text"]')
    ) {
      event.preventDefault();
      goNext();
    }
  });

  $("#footerYear").textContent = new Date().getFullYear();
  syncSeniorMode(document.documentElement.classList.contains("senior-mode"), false);
  Object.values(views).forEach((view) => {
    if (!view.classList.contains("is-active")) view.setAttribute("aria-hidden", "true");
  });
  updateStepUI();
})();
