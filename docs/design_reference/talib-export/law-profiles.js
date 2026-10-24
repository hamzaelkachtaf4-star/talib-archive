(function () {
  var V = 'verified', R = 'ref';
  var B = {
    criminal: {
      label: 'القانون الجنائي', icon: '⚖️', color: '#b4553f',
      essence: 'قانون النص الصريح: لا جريمة ولا عقوبة إلا بنص.',
      authority: 4, custom: 0, ijtihad: 1,
      customText: 'مستبعد تماماً في التجريم والعقاب.',
      ijtihadText: 'يفسّر النص ولا يُنشئ جريمة أو عقوبة.',
      interpretation: 'تفسير ضيق للنص، ومنع القياس في التجريم والعقاب، والشك يُفسَّر لصالح المتهم.',
      sources: [['النص الجنائي الصريح (مجموعة القانون الجنائي والنصوص الخاصة)', 'ف.3 ق.ج', V], ['الدستور: قرينة البراءة والمحاكمة العادلة', 'الفصل 23', R], ['الاجتهاد القضائي في حدود تفسير النص', '', R]],
      principles: [['مبدأ الشرعية: لا يؤاخذ أحد على فعل لا يعد جريمة بصريح القانون، ولا يعاقب بعقوبة لم يقررها القانون', 'ف.3 ق.ج', V], ['عدم رجعية القانون الجنائي', 'ف.4 ق.ج', V], ['لا مؤاخذة على فعل لم يعد جريمة بقانون لاحق', 'ف.5 ق.ج', V], ['تطبيق القانون الأصلح للمتهم', 'ف.6 ق.ج', V], ['الجريمة عمل أو امتناع مخالف للقانون الجنائي ومعاقب عليه بمقتضاه', 'ف.110 ق.ج', V]],
      redlines: ['تطبيق عرف أو رأي فقهي لتجريم فعل أو تقرير عقوبة', 'القياس على نص للتجريم أو لتشديد العقوبة', 'اقتراح عقوبة غير منصوص عليها، مهما كانت خطورة الفعل'],
      guard: 'CRIMINAL LAW. Apply the principle of legality strictly (Art.3 of the Moroccan Penal Code): no crime and no penalty without an explicit text. Never use custom, tribal practice, religious doctrine or analogy to create an offence or a penalty. Interpret penal texts narrowly; doubt benefits the accused; non-retroactivity (Art.4) except the more lenient law (Arts.5-6). Every offence must be qualified with its constituent elements (legal, material, moral) and its exact article. If no text criminalises the act, say so.'
    },
    commercial: {
      label: 'القانون التجاري', icon: '🏪', color: '#3b6fc4',
      essence: 'قانون السرعة والائتمان: العرف التجاري يتقدم على القانون المدني.',
      authority: 3, custom: 3, ijtihad: 2,
      customText: 'مصدر رسمي بعد النص التجاري، والعرف الخاص والمحلي يرجح على العام.',
      ijtihadText: 'مهم في سد الفراغ ومواكبة الممارسة.',
      interpretation: 'يُفسَّر بما يخدم السرعة والثقة والائتمان، ولا يُرجع للقانون المدني إلا فيما لا يتعارض مع المبادئ الأساسية للقانون التجاري.',
      sources: [['قوانين التجارة (مدونة التجارة والنصوص الخاصة)', 'م.2 م.ت', V], ['أعراف وعادات التجارة: الخاصة والمحلية قبل العامة', 'م.2 و3 م.ت', V], ['القانون المدني (ق.ل.ع) ما لم يتعارض مع المبادئ الأساسية للقانون التجاري', 'م.2 م.ت', V]],
      principles: [['يفصل في المسائل التجارية بقوانين وأعراف وعادات التجارة أو بالقانون المدني ما لم يتعارض مع مبادئ القانون التجاري', 'م.2 م.ت', V], ['ترجح الأعراف والعادات الخاصة والمحلية على العامة', 'م.3 م.ت', V], ['العمل المختلط: تطبق قواعد القانون التجاري في مواجهة من كان العمل تجارياً بالنسبة إليه', 'م.4 م.ت', V], ['حرية الإثبات في المادة التجارية', 'م.334 م.ت', R], ['افتراض التضامن في الالتزامات التجارية', 'م.335 م.ت', R]],
      redlines: ['تطبيق ق.ل.ع مباشرة قبل التحقق من وجود نص أو عرف تجاري', 'إغفال الطبيعة التجارية أو المختلطة للعمل قبل الحل'],
      guard: 'COMMERCIAL LAW. Follow Art.2 of the Moroccan Commercial Code: first commercial statutes, then commercial customs and usages (special and local customs prevail over general ones, Art.3), and only then the civil law (D.O.C.) where it does not conflict with the fundamental principles of commercial law. Always qualify whether the act is commercial, civil or mixed (Art.4) before applying rules.'
    },
    civil: {
      label: 'القانون المدني', icon: '📘', color: '#1f8a5b',
      essence: 'الشريعة العامة: النص أولاً، ثم إرادة الأطراف، والعرف لا يخالف نصاً صريحاً.',
      authority: 3, custom: 2, ijtihad: 2,
      customText: 'مكمّل ومفسّر، ولا يجوز أن يخالف نصاً صريحاً.',
      ijtihadText: 'يفسّر ويملأ الفراغ في حدود النصوص.',
      interpretation: 'إذا كانت ألفاظ العقد صريحة امتنع البحث عن قصد صاحبها، وإلا بُحث عن النية المشتركة للمتعاقدين.',
      sources: [['النص التشريعي (ق.ل.ع والقوانين الخاصة)', 'ق.ل.ع', V], ['العقد شريعة المتعاقدين', 'ف.230 ق.ل.ع', R], ['العرف والعادة دون مخالفة نص صريح', 'ف.475 ق.ل.ع', V]],
      principles: [['لا يسوغ للعرف والعادة أن يخالفا القانون إن كان صريحاً', 'ف.475 ق.ل.ع', V], ['لا تلغى القوانين إلا بقوانين لاحقة صراحة أو ضمناً', 'ف.474 ق.ل.ع', V], ['الالتزامات التعاقدية المنشأة على وجه صحيح تقوم مقام القانون بالنسبة لمنشئيها', 'ف.230 ق.ل.ع', R], ['قواعد تفسير العقد', 'ف.461 وما يليه ق.ل.ع', R]],
      redlines: ['تقديم العرف على نص صريح', 'الخلط بين المسؤولية العقدية والتقصيرية في التكييف'],
      guard: 'CIVIL LAW (D.O.C.). Apply the statutory text first, then the contract as law between the parties, then custom only where it does not contradict an explicit text (Art.475 D.O.C.). Distinguish contractual and tort liability before applying rules, and cite D.O.C. articles.'
    },
    family: {
      label: 'قانون الأسرة', icon: '👪', color: '#8b6cf0',
      essence: 'نص المدونة أولاً، وما لا نص فيه يُرجع فيه إلى المذهب المالكي والاجتهاد.',
      authority: 3, custom: 1, ijtihad: 3,
      customText: 'محدود، ويدخل أساساً عبر ما جرى به العمل في الفقه المالكي.',
      ijtihadText: 'مصدر تكميلي صريح بنص المادة 400، مؤطر بقيم العدل والمساواة والمعاشرة بالمعروف.',
      interpretation: 'تطبيق نص المدونة، وفي ما لا نص فيه الرجوع إلى المذهب المالكي والاجتهاد مع مراعاة قيم الإسلام في العدل والمساواة والمعاشرة بالمعروف.',
      sources: [['مدونة الأسرة', 'القانون 70.03', V], ['المذهب المالكي والاجتهاد في ما لم يرد به نص', 'م.400 م.أ', V]],
      principles: [['كل ما لم يرد به نص في المدونة يرجع فيه إلى المذهب المالكي والاجتهاد الذي يراعى فيه تحقيق قيم الإسلام في العدل والمساواة والمعاشرة بالمعروف', 'م.400 م.أ', V]],
      redlines: ['الرجوع إلى الفقه قبل التحقق من غياب نص في المدونة', 'تطبيق أحكام مدونة الأحوال الشخصية الملغاة'],
      guard: 'FAMILY LAW. Apply the Family Code (Law 70.03) first. Only where there is no text, refer to Maliki jurisprudence and ijtihad that realises the Islamic values of justice, equality and good conduct (Art.400). Never cite the repealed 1957 Personal Status Code as current law.'
    },
    realestate: {
      label: 'القانون العقاري', icon: '🏠', color: '#c79a2e',
      essence: 'تدرج صريح: مدونة الحقوق العينية، ثم ق.ل.ع، ثم الراجح والمشهور وما جرى به العمل من الفقه المالكي.',
      authority: 3, custom: 1, ijtihad: 2,
      customText: 'يدخل عبر «ما جرى به العمل» في الفقه المالكي.',
      ijtihadText: 'مقيد بالراجح والمشهور وما جرى به العمل.',
      interpretation: 'احترام التدرج الذي حددته المادة الأولى، مع مراعاة خصوصية العقار المحفظ وغير المحفظ.',
      sources: [['مدونة الحقوق العينية والتشريعات الخاصة بالعقار', 'م.1 م.ح.ع', V], ['ق.ل.ع في ما لم يرد به نص', 'م.1 م.ح.ع', V], ['الراجح والمشهور وما جرى به العمل من الفقه المالكي', 'م.1 م.ح.ع', V]],
      principles: [['تطبق مقتضيات ق.ل.ع في ما لم يرد به نص، فإن لم يوجد نص يرجع إلى الراجح والمشهور وما جرى به العمل من الفقه المالكي', 'م.1 م.ح.ع', V]],
      redlines: ['الرجوع إلى الفقه المالكي قبل ق.ل.ع', 'إغفال التمييز بين العقار المحفظ وغير المحفظ'],
      guard: 'REAL PROPERTY LAW. Follow Art.1 of the Real Rights Code (Law 39.08): first that code and special property legislation, then the D.O.C. where there is no text, then the prevailing, well-known opinion and established practice (al-rajih wal-mashhur wa ma jara bihi al-amal) of Maliki fiqh. Distinguish registered and unregistered property.'
    },
    labor: {
      label: 'قانون الشغل', icon: '👷', color: '#1aa3a3',
      essence: 'قانون حمائي: قواعد آمرة من النظام العام الاجتماعي، والأولوية لما هو أكثر فائدة للأجير.',
      authority: 3, custom: 2, ijtihad: 3,
      customText: 'العرف المهني والاتفاقيات الجماعية مصادر مهمة متى كانت أفيد للأجير.',
      ijtihadText: 'دور كبير لاجتهاد محكمة النقض في الفصل والتعويض.',
      interpretation: 'القواعد آمرة، وتفسَّر بما يحقق حماية أكبر للأجير، وعند التنازع تُقدَّم المقتضيات الأكثر فائدة له.',
      sources: [['مدونة الشغل (قواعد آمرة)', 'القانون 65.99', V], ['الاتفاقيات الجماعية والنظام الداخلي', '', R], ['عقد الشغل', '', R], ['العرف المهني', '', R]],
      principles: [['الطابع الآمر لقواعد الشغل وارتباطها بالنظام العام الاجتماعي', '', R], ['تطبيق المقتضى الأكثر فائدة للأجير عند التنازع', '', R]],
      redlines: ['إعمال شرط تعاقدي أقل فائدة من الحد الأدنى القانوني', 'إغفال مسطرة الفصل التأديبي قبل مناقشة الخطأ'],
      guard: 'LABOUR LAW. The Labour Code (Law 65.99) is protective and mandatory (social public order). When rules conflict, apply the provision most favourable to the employee. Check dismissal procedure before discussing the merits of the misconduct. Cite Labour Code articles.'
    },
    administrative: {
      label: 'القانون الإداري', icon: '🏛️', color: '#3b5b9c',
      essence: 'قانون قضائي النشأة: الاجتهاد الإداري يصنع كثيراً من قواعده، في إطار مبدأ المشروعية.',
      authority: 2, custom: 1, ijtihad: 4,
      customText: 'محدود.',
      ijtihadText: 'دور إنشائي: القاضي الإداري يبتكر القواعد والمبادئ العامة.',
      interpretation: 'مبدأ المشروعية وخضوع الإدارة للقانون، مع الموازنة بين المصلحة العامة وحقوق الأفراد.',
      sources: [['الدستور والنصوص التشريعية والتنظيمية', '', R], ['الاجتهاد القضائي الإداري والمبادئ العامة للقانون', '', R]],
      principles: [['كل قرار إداري قابل للطعن أمام الهيئة القضائية الإدارية المختصة', 'الفصل 118', R], ['المحاكم الإدارية', 'القانون 41.90', V]],
      redlines: ['تطبيق قواعد القانون الخاص على الإدارة دون تبرير', 'إغفال شروط دعوى الإلغاء وآجالها'],
      guard: 'ADMINISTRATIVE LAW. Reason from the principle of legality; case law of administrative courts and general principles of law are central sources. Distinguish annulment and full-jurisdiction actions and check admissibility conditions.'
    },
    constitutional: {
      label: 'القانون الدستوري', icon: '📜', color: '#c79a2e',
      essence: 'قمة الهرم: دستورية القواعد وتراتبيتها ووجوب نشرها مبادئ ملزمة.',
      authority: 4, custom: 1, ijtihad: 2,
      customText: 'الأعراف الدستورية محدودة الأثر.',
      ijtihadText: 'قرارات المحكمة الدستورية ملزمة لكل السلطات.',
      interpretation: 'قراءة النص الدستوري في انسجامه، مع اعتماد قرارات المحكمة الدستورية.',
      sources: [['الدستور', 'دستور 2011', V], ['القوانين التنظيمية', '', V], ['قرارات المحكمة الدستورية', '', R]],
      principles: [['دستورية القواعد القانونية وتراتبيتها ووجوب نشرها مبادئ ملزمة، وليس للقانون أثر رجعي', 'الفصل 6', R]],
      redlines: ['الاستشهاد بدستور 1996 كنص ساري'],
      guard: 'CONSTITUTIONAL LAW. The 2011 Constitution is supreme; constitutionality, hierarchy and publication of norms are binding principles. Cite articles of the 2011 Constitution and decisions of the Constitutional Court; never present the 1996 constitution as current.'
    },
    procedure: {
      label: 'المسطرة', icon: '📋', color: '#6b5b95',
      essence: 'قواعد شكلية: الإجراء والأجل والاختصاص قبل الموضوع.',
      authority: 4, custom: 0, ijtihad: 2,
      customText: 'لا دور له في الإجراءات.',
      ijtihadText: 'يفسّر شروط القبول والآجال.',
      interpretation: 'احترام الشكل والآجال بدقة، وفحص القبول قبل الموضوع.',
      sources: [['قانون المسطرة المدنية أو الجنائية', '', V], ['التنظيم القضائي', 'القانون 38.15', V]],
      principles: [['الصفة والأهلية والمصلحة شروط لقبول الدعوى', 'ف.1 ق.م.م', R]],
      redlines: ['مناقشة الموضوع قبل الشكل والاختصاص', 'إغفال الآجال'],
      guard: 'PROCEDURAL LAW. Always examine jurisdiction, standing, capacity, interest and time limits before the merits. Procedural rules are applied strictly.'
    }
  };
  var KW = [['criminal', ['جنائي', 'جنائية', 'الجريمة', 'العقوبات', 'زجري']], ['family', ['أسرة', 'الأسرة', 'الأحوال الشخصية', 'الميراث', 'المواريث']], ['realestate', ['عقار', 'العقاري', 'الحقوق العينية', 'التحفيظ']], ['labor', ['شغل', 'الشغل', 'الاجتماعي', 'الضمان الاجتماعي']], ['commercial', ['تجاري', 'التجاري', 'التجارة', 'الشركات', 'المقاولة', 'الأوراق التجارية', 'البنكي']], ['administrative', ['إداري', 'الإداري', 'الإدارية', 'الوظيفة العمومية', 'المنازعات الإدارية']], ['constitutional', ['دستوري', 'الدستوري', 'الدستور']], ['procedure', ['مسطرة', 'المسطرة']], ['civil', ['مدني', 'المدنية', 'الالتزامات', 'العقود', 'المسؤولية']]];
  function detect(name) {
    name = name || '';
    if (name.indexOf('المسطرة الجنائية') >= 0) return 'criminal';
    for (var i = 0; i < KW.length; i++) for (var j = 0; j < KW[i][1].length; j++) if (name.indexOf(KW[i][1][j]) >= 0) return KW[i][0];
    return 'civil';
  }
  window.TALIB_LAW = {
    branches: B, order: ['constitutional', 'criminal', 'civil', 'commercial', 'family', 'realestate', 'labor', 'administrative', 'procedure'],
    detect: detect,
    get: function (k) { return B[k] || B.civil; },
    guard: function (k) { var b = B[k] || B.civil; return 'LEGAL NATURE OF THIS BRANCH — ' + b.guard + ' Red lines (never do): ' + b.redlines.join('; ') + '. If unsure of an article number, say so instead of inventing it.'; }
  };
})();
