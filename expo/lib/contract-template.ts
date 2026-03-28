export interface ContractData {
  contractNumber: string;
  date: string;
  clientName: string;
  clientId: string;
  clientAddress: string;
  clientEmail: string;
  clientPhone: string;
  developerName: string;
  developerId: string;
  developerAddress: string;
  developerEmail: string;
  developerPhone: string;
  projectName: string;
  projectDescription: string;
  projectObjectives: string;
  projectPlatforms: string;
  projectFeatures: string;
  projectTechStack: string;
  projectDeliverables: string;
  projectMilestones: string;
  projectAcceptanceCriteria: string;
  totalAmount: string;
  currency: string;
  deliveryDays: string;
  refundPercentage: string;
  jurisdiction: string;
  language: 'en' | 'es';
  paymentAccountNumber: string;
  paymentBankName: string;
  paymentAccountHolder: string;
  paymentRoutingNumber: string;
  contractAmount: string;
  attachedImages?: { base64: string; label: string }[];
  brandingAppName?: string;
  brandingCompanyName?: string;
  brandingTagline?: string;
  brandingWebsite?: string;
  brandingLogoBase64?: string;
  brandingPrimaryColor?: string;
  brandingAccentColor?: string;
}

export function generateContractHTML(data: ContractData): string {
  const isSpanish = data.language === 'es';

  const labels = isSpanish ? {
    title: 'CONTRATO INTERNACIONAL DE DESARROLLO DE SOFTWARE',
    subtitle: 'CON PROTECCIÓN LEGAL COMPLETA',
    contractNo: 'Contrato N°',
    dateLabel: 'Fecha',
    partiesTitle: 'I. PARTES CONTRATANTES',
    clientTitle: 'EL CLIENTE (Contratante)',
    developerTitle: 'EL DESARROLLADOR (Contratista)',
    nameLabel: 'Nombre Completo',
    idLabel: 'Documento de Identidad',
    addressLabel: 'Dirección',
    emailLabel: 'Correo Electrónico',
    phoneLabel: 'Teléfono',
    objectTitle: 'II. OBJETO DEL CONTRATO',
    projectLabel: 'Proyecto',
    descriptionLabel: 'Descripción General',
    objectivesLabel: 'Objetivos del Proyecto',
    platformsLabel: 'Plataformas Objetivo',
    featuresLabel: 'Funcionalidades Principales',
    techStackLabel: 'Stack Tecnológico',
    deliverablesLabel: 'Entregables Esperados',
    milestonesLabel: 'Fases / Hitos del Proyecto',
    acceptanceLabel: 'Criterios de Aceptación',
    scopeTitle: 'III. ALCANCE Y FUNCIONALIDADES',
    scopeText: 'El DESARROLLADOR se compromete a entregar el proyecto con el 100% de las funcionalidades acordadas, completamente funcional en las plataformas iOS, Android y Backend, incluyendo pero no limitado a: todas las características descritas en la Descripción del Proyecto, código fuente completo, documentación técnica, y soporte post-entrega por 90 días.',
    paymentTitle: 'IV. VALOR Y FORMA DE PAGO',
    totalAmount: 'Monto Total del Contrato',
    contractAmountLabel: 'Valor del Contrato',
    paymentTerms: 'Términos de Pago',
    paymentAccountTitle: 'INFORMACIÓN BANCARIA PARA PAGOS',
    bankNameLabel: 'Banco',
    accountNumberLabel: 'Número de Cuenta',
    accountHolderLabel: 'Titular de la Cuenta',
    routingNumberLabel: 'Número de Ruta / SWIFT',
    paymentText1: `El pago se realizará en la moneda acordada (${data.currency}).`,
    paymentText2: '50% al inicio del proyecto como anticipo.',
    paymentText3: '25% al completar el 75% del desarrollo.',
    paymentText4: '25% restante a la entrega final y aprobación.',
    paymentText5: `Los pagos serán realizados dentro de las 24 a 48 horas siguientes al cumplimiento de cada hito.`,
    paymentText6: 'Todos los pagos deberán ser depositados ÚNICAMENTE en la cuenta bancaria especificada en este contrato.',
    paymentText7: 'Cualquier pago realizado a una cuenta diferente NO será reconocido como cumplimiento de las obligaciones de pago.',
    deliveryTitle: 'V. PLAZO DE ENTREGA',
    deliveryText: `El DESARROLLADOR se compromete a entregar el proyecto completo dentro de ${data.deliveryDays} días calendario contados a partir de la firma del presente contrato. Cualquier extensión deberá ser acordada por escrito por ambas partes.`,
    refundTitle: 'VI. GARANTÍA DE REEMBOLSO TOTAL',
    refundText1: `En caso de que el DESARROLLADOR NO complete el 100% de las funcionalidades acordadas dentro del plazo establecido, se procederá al REEMBOLSO TOTAL del ${data.refundPercentage}% del monto pagado por el CLIENTE.`,
    refundText2: 'El reembolso deberá ejecutarse dentro de las 24 a 48 horas siguientes a la notificación formal de incumplimiento.',
    refundText3: 'No se aceptarán entregas parciales como cumplimiento del contrato.',
    refundText4: 'El CLIENTE tiene derecho a retener todo el código fuente entregado hasta la fecha.',
    lawyerTitle: 'VII. HONORARIOS LEGALES Y COSTOS JUDICIALES',
    lawyerText1: 'En caso de incumplimiento por parte del DESARROLLADOR, todos los honorarios de abogados, costos judiciales, gastos de peritaje técnico y cualquier otro gasto legal será asumido ÍNTEGRAMENTE por el DESARROLLADOR.',
    lawyerText2: 'Esto incluye pero no se limita a:',
    lawyerItem1: 'Honorarios de abogados nacionales e internacionales',
    lawyerItem2: 'Costos de procedimientos judiciales y arbitraje',
    lawyerItem3: 'Gastos de peritaje técnico independiente',
    lawyerItem4: 'Costos de traducción de documentos legales',
    lawyerItem5: 'Gastos de viaje relacionados con procedimientos legales',
    lawyerItem6: 'Intereses moratorios sobre el monto adeudado',
    penaltyTitle: 'VIII. CLÁUSULAS PENALES Y EJECUTIVAS',
    penaltyText1: 'El incumplimiento del presente contrato por parte del DESARROLLADOR constituirá DELITO DE ESTAFA conforme a las leyes aplicables.',
    penaltyText2: 'El CLIENTE podrá iniciar acciones penales ante las autoridades competentes, incluyendo denuncia policial por ESTAFA y APROPIACIÓN INDEBIDA.',
    penaltyText3: 'Las autoridades policiales podrán ejecutar la DETENCIÓN del DESARROLLADOR conforme a las órdenes judiciales emitidas por incumplimiento contractual.',
    penaltyText4: 'El DESARROLLADOR renuncia expresamente a cualquier excepción o recurso dilatorio que pretenda impedir la ejecución inmediata de las obligaciones aquí pactadas.',
    penaltyText5: 'La cláusula penal se establece en el 150% del valor total del contrato, como indemnización por daños y perjuicios.',
    ipTitle: 'IX. PROPIEDAD INTELECTUAL',
    ipText1: 'Todo el código fuente, diseños, documentación y materiales desarrollados serán propiedad EXCLUSIVA del CLIENTE una vez completado el pago total.',
    ipText2: 'El DESARROLLADOR cede irrevocablemente todos los derechos de propiedad intelectual al CLIENTE.',
    ipText3: 'El DESARROLLADOR no podrá utilizar, copiar, distribuir o crear obras derivadas del código entregado.',
    confidentialTitle: 'X. ACUERDO DE CONFIDENCIALIDAD Y NO DIVULGACIÓN (NDA)',
    confidentialText: 'Ambas partes se comprometen a mantener en estricta confidencialidad toda la información compartida durante la ejecución del presente contrato. La violación de esta cláusula generará una penalidad equivalente al 200% del valor del contrato.',
    ndaScope: 'ALCANCE DE LA CONFIDENCIALIDAD',
    ndaScopeText: 'El DESARROLLADOR reconoce que tendrá acceso a información confidencial y propietaria del CLIENTE, incluyendo pero no limitado a:',
    ndaItem1: 'Código fuente, arquitectura de software, algoritmos, diseños de base de datos y lógica de negocio de la aplicación',
    ndaItem2: 'Estrategias comerciales, planes de negocio, modelos financieros e información de inversores',
    ndaItem3: 'Datos de usuarios, información personal, registros financieros y transacciones',
    ndaItem4: 'Claves de API, credenciales de acceso, certificados de seguridad y configuraciones de servidores',
    ndaItem5: 'Diseños de interfaz de usuario, wireframes, mockups y materiales de marca',
    ndaItem6: 'Contratos con terceros, acuerdos comerciales y relaciones con socios',
    ndaItem7: 'Cualquier información marcada como "Confidencial" o que razonablemente se considere como tal',
    ndaObligations: 'OBLIGACIONES DEL DESARROLLADOR',
    ndaObligation1: 'No divulgar, publicar, transmitir ni compartir información confidencial con terceros bajo ninguna circunstancia',
    ndaObligation2: 'No utilizar la información confidencial para beneficio propio o de terceros fuera del alcance del proyecto',
    ndaObligation3: 'No copiar, reproducir ni almacenar información confidencial en dispositivos o servicios personales no autorizados',
    ndaObligation4: 'Implementar medidas de seguridad adecuadas para proteger la información confidencial (encriptación, contraseñas seguras, autenticación de dos factores)',
    ndaObligation5: 'Notificar inmediatamente al CLIENTE sobre cualquier brecha de seguridad, acceso no autorizado o divulgación accidental',
    ndaObligation6: 'No realizar ingeniería inversa, descompilar ni desensamblar ningún componente del proyecto',
    ndaObligation7: 'No publicar capturas de pantalla, demos, ni referencias al proyecto en portafolios sin autorización expresa por escrito del CLIENTE',
    ndaSourceCode: 'PROTECCIÓN DEL CÓDIGO FUENTE',
    ndaSourceCodeText: 'El DESARROLLADOR se compromete específicamente a:',
    ndaSourceCode1: 'No compartir el código fuente en repositorios públicos (GitHub, GitLab, Bitbucket, etc.)',
    ndaSourceCode2: 'No reutilizar componentes, módulos o bibliotecas propietarias desarrolladas para este proyecto en otros proyectos',
    ndaSourceCode3: 'Utilizar únicamente repositorios privados autorizados por el CLIENTE para el desarrollo',
    ndaSourceCode4: 'Eliminar todas las copias locales del código fuente al finalizar el contrato, proporcionando certificación escrita de dicha eliminación',
    ndaSourceCode5: 'No incluir backdoors, código malicioso, ni accesos no autorizados ocultos en el código entregado',
    ndaNonCompete: 'CLÁUSULA DE NO COMPETENCIA',
    ndaNonCompeteText: 'El DESARROLLADOR se compromete a NO desarrollar, participar ni asesorar en proyectos directamente competitivos con el proyecto del CLIENTE durante la vigencia del contrato y por un período de 24 meses posteriores a la terminación del mismo. Esto incluye aplicaciones de inversión inmobiliaria, plataformas de tokenización de propiedades o servicios financieros similares en el mercado ecuatoriano y latinoamericano.',
    ndaNonSolicit: 'CLÁUSULA DE NO SOLICITUD',
    ndaNonSolicitText: 'El DESARROLLADOR se compromete a no solicitar, contratar ni intentar contratar a empleados, consultores, clientes o socios comerciales del CLIENTE durante la vigencia del contrato y 12 meses posteriores a su terminación.',
    ndaReturnMaterials: 'DEVOLUCIÓN DE MATERIALES',
    ndaReturnText: 'Al finalizar el contrato, ya sea por cumplimiento, terminación o cualquier otra causa, el DESARROLLADOR deberá en un plazo máximo de 48 horas:',
    ndaReturn1: 'Devolver toda la documentación, materiales y copias relacionadas con el proyecto',
    ndaReturn2: 'Eliminar permanentemente toda información confidencial de todos sus dispositivos y servicios en la nube',
    ndaReturn3: 'Revocar todos los accesos a repositorios, servidores y servicios del proyecto',
    ndaReturn4: 'Proporcionar una declaración jurada confirmando el cumplimiento de esta cláusula',
    ndaSurvival: 'SUPERVIVENCIA DEL NDA',
    ndaSurvivalText: 'Las obligaciones de confidencialidad establecidas en esta sección sobrevivirán a la terminación del contrato por un período de CINCO (5) AÑOS, independientemente de la causa de terminación.',
    ndaPenalty: 'PENALIDADES POR VIOLACIÓN DEL NDA',
    ndaPenaltyText1: 'La violación de cualquier cláusula de confidencialidad generará una penalidad INMEDIATA equivalente al 300% del valor total del contrato.',
    ndaPenaltyText2: 'Adicionalmente, el DESARROLLADOR será responsable de todos los daños directos, indirectos, consecuentes y punitivos causados por la violación.',
    ndaPenaltyText3: 'El CLIENTE podrá iniciar acciones penales por violación de secretos comerciales, espionaje industrial y competencia desleal conforme a las leyes ecuatorianas (Código Orgánico Integral Penal - COIP) e internacionales.',
    ndaPenaltyText4: 'En caso de divulgación de datos de usuarios, el DESARROLLADOR asumirá la responsabilidad total ante las autoridades de protección de datos conforme a la Ley Orgánica de Protección de Datos Personales del Ecuador.',
    jurisdictionTitle: 'XI. JURISDICCIÓN Y LEY APLICABLE',
    jurisdictionText1: `El presente contrato se regirá por las leyes de ${data.jurisdiction}.`,
    jurisdictionText2: `Para cualquier controversia derivada del presente contrato, las partes se someten a la jurisdicción de los tribunales competentes de ${data.jurisdiction}, renunciando expresamente a cualquier otro fuero.`,
    jurisdictionText3: 'Adicionalmente, las partes acuerdan que este contrato tiene validez internacional conforme a la Convención de las Naciones Unidas sobre los Contratos de Compraventa Internacional de Mercaderías y tratados internacionales aplicables.',
    disputeTitle: 'XII. RESOLUCIÓN DE DISPUTAS',
    disputeText1: 'En caso de disputa, las partes intentarán resolverla amigablemente durante un período de 15 días calendario.',
    disputeText2: 'Si no se logra un acuerdo amigable, se procederá a arbitraje internacional ante la Cámara de Comercio Internacional.',
    disputeText3: 'El laudo arbitral será definitivo, vinculante y ejecutable en cualquier jurisdicción.',
    forceTitle: 'XIII. FUERZA MAYOR',
    forceText: 'Ninguna de las partes será responsable por el incumplimiento de sus obligaciones cuando este sea causado por fuerza mayor debidamente comprobada. Sin embargo, el DESARROLLADOR deberá notificar al CLIENTE dentro de las 48 horas siguientes al evento de fuerza mayor.',
    terminationTitle: 'XIV. TERMINACIÓN',
    terminationText1: 'El CLIENTE podrá terminar este contrato en cualquier momento con notificación escrita de 15 días.',
    terminationText2: 'En caso de terminación por incumplimiento del DESARROLLADOR, se aplicarán todas las cláusulas penales y de reembolso establecidas.',
    generalTitle: 'XV. DISPOSICIONES GENERALES',
    generalText1: 'Este contrato constituye el acuerdo completo entre las partes y reemplaza cualquier acuerdo previo.',
    generalText2: 'Cualquier modificación deberá ser por escrito y firmada por ambas partes.',
    generalText3: 'Si alguna cláusula es declarada nula, las demás seguirán en pleno vigor.',
    generalText4: 'Este contrato se firma en dos ejemplares de igual valor, uno para cada parte.',
    signaturesTitle: 'FIRMAS',
    clientSig: 'EL CLIENTE',
    developerSig: 'EL DESARROLLADOR',
    signLine: 'Firma',
    dateLine: 'Fecha',
    witnessTitle: 'TESTIGOS',
    witness1: 'Testigo 1',
    witness2: 'Testigo 2',
    notaryTitle: 'NOTARIZACIÓN',
    notaryText: 'El presente contrato podrá ser elevado a escritura pública ante notario para mayor validez legal.',
    legalNotice: 'AVISO LEGAL: Este contrato tiene plena validez legal conforme a la legislación ecuatoriana e internacional. El incumplimiento de las obligaciones aquí establecidas dará lugar a acciones civiles y penales conforme a la ley.',
  } : {
    title: 'INTERNATIONAL SOFTWARE DEVELOPMENT CONTRACT',
    subtitle: 'WITH FULL LEGAL PROTECTION',
    contractNo: 'Contract No.',
    dateLabel: 'Date',
    partiesTitle: 'I. CONTRACTING PARTIES',
    clientTitle: 'THE CLIENT (Contractor)',
    developerTitle: 'THE DEVELOPER (Contractor)',
    nameLabel: 'Full Name',
    idLabel: 'Identification Document',
    addressLabel: 'Address',
    emailLabel: 'Email',
    phoneLabel: 'Phone',
    objectTitle: 'II. PURPOSE OF THE CONTRACT',
    projectLabel: 'Project',
    descriptionLabel: 'General Description',
    objectivesLabel: 'Project Objectives',
    platformsLabel: 'Target Platforms',
    featuresLabel: 'Key Features & Functionalities',
    techStackLabel: 'Technology Stack',
    deliverablesLabel: 'Expected Deliverables',
    milestonesLabel: 'Project Phases / Milestones',
    acceptanceLabel: 'Acceptance Criteria',
    scopeTitle: 'III. SCOPE AND FUNCTIONALITIES',
    scopeText: 'The DEVELOPER commits to deliver the project with 100% of the agreed functionalities, fully functional on iOS, Android, and Backend platforms, including but not limited to: all features described in the Project Description, complete source code, technical documentation, and post-delivery support for 90 days.',
    paymentTitle: 'IV. VALUE AND PAYMENT TERMS',
    totalAmount: 'Total Contract Amount',
    contractAmountLabel: 'Contract Value',
    paymentTerms: 'Payment Terms',
    paymentAccountTitle: 'BANK INFORMATION FOR PAYMENTS',
    bankNameLabel: 'Bank',
    accountNumberLabel: 'Account Number',
    accountHolderLabel: 'Account Holder',
    routingNumberLabel: 'Routing / SWIFT Number',
    paymentText1: `Payment will be made in the agreed currency (${data.currency}).`,
    paymentText2: '50% at project start as advance payment.',
    paymentText3: '25% upon completion of 75% of development.',
    paymentText4: '25% remaining upon final delivery and approval.',
    paymentText5: 'Payments shall be made within 24 to 48 hours following the completion of each milestone.',
    paymentText6: 'All payments must be deposited ONLY into the bank account specified in this contract.',
    paymentText7: 'Any payment made to a different account will NOT be recognized as fulfillment of payment obligations.',
    deliveryTitle: 'V. DELIVERY TIMELINE',
    deliveryText: `The DEVELOPER commits to deliver the complete project within ${data.deliveryDays} calendar days from the signing of this contract. Any extension must be agreed in writing by both parties.`,
    refundTitle: 'VI. FULL REFUND GUARANTEE',
    refundText1: `In the event that the DEVELOPER DOES NOT complete 100% of the agreed functionalities within the established deadline, a FULL REFUND of ${data.refundPercentage}% of the amount paid by the CLIENT shall proceed.`,
    refundText2: 'The refund must be executed within 24 to 48 hours following formal notification of non-compliance.',
    refundText3: 'Partial deliveries will not be accepted as contract fulfillment.',
    refundText4: 'The CLIENT has the right to retain all source code delivered to date.',
    lawyerTitle: 'VII. LEGAL FEES AND COURT COSTS',
    lawyerText1: 'In case of non-compliance by the DEVELOPER, all attorney fees, court costs, technical expert fees, and any other legal expenses shall be borne ENTIRELY by the DEVELOPER.',
    lawyerText2: 'This includes but is not limited to:',
    lawyerItem1: 'National and international attorney fees',
    lawyerItem2: 'Judicial proceedings and arbitration costs',
    lawyerItem3: 'Independent technical expert fees',
    lawyerItem4: 'Legal document translation costs',
    lawyerItem5: 'Travel expenses related to legal proceedings',
    lawyerItem6: 'Default interest on the owed amount',
    penaltyTitle: 'VIII. PENALTY AND ENFORCEMENT CLAUSES',
    penaltyText1: 'Non-compliance with this contract by the DEVELOPER shall constitute FRAUD under applicable laws.',
    penaltyText2: 'The CLIENT may initiate criminal proceedings before competent authorities, including police complaints for FRAUD and MISAPPROPRIATION.',
    penaltyText3: 'Police authorities may execute the ARREST of the DEVELOPER pursuant to judicial orders issued for contractual breach.',
    penaltyText4: 'The DEVELOPER expressly waives any exception or dilatory remedy that may attempt to prevent immediate enforcement of obligations agreed herein.',
    penaltyText5: 'The penalty clause is established at 150% of the total contract value as compensation for damages.',
    ipTitle: 'IX. INTELLECTUAL PROPERTY',
    ipText1: 'All source code, designs, documentation, and materials developed shall be the EXCLUSIVE property of the CLIENT upon full payment completion.',
    ipText2: 'The DEVELOPER irrevocably assigns all intellectual property rights to the CLIENT.',
    ipText3: 'The DEVELOPER may not use, copy, distribute, or create derivative works from the delivered code.',
    confidentialTitle: 'X. NON-DISCLOSURE AGREEMENT (NDA) & CONFIDENTIALITY',
    confidentialText: 'Both parties commit to maintain in strict confidentiality all information shared during the execution of this contract. Violation of this clause shall generate a penalty equivalent to 200% of the contract value.',
    ndaScope: 'SCOPE OF CONFIDENTIALITY',
    ndaScopeText: 'The DEVELOPER acknowledges that they will have access to confidential and proprietary information of the CLIENT, including but not limited to:',
    ndaItem1: 'Source code, software architecture, algorithms, database designs, and business logic of the application',
    ndaItem2: 'Business strategies, business plans, financial models, and investor information',
    ndaItem3: 'User data, personal information, financial records, and transactions',
    ndaItem4: 'API keys, access credentials, security certificates, and server configurations',
    ndaItem5: 'User interface designs, wireframes, mockups, and branding materials',
    ndaItem6: 'Third-party contracts, commercial agreements, and partner relationships',
    ndaItem7: 'Any information marked as "Confidential" or reasonably considered as such',
    ndaObligations: 'DEVELOPER OBLIGATIONS',
    ndaObligation1: 'Not disclose, publish, transmit, or share confidential information with third parties under any circumstances',
    ndaObligation2: 'Not use confidential information for personal benefit or that of third parties outside the project scope',
    ndaObligation3: 'Not copy, reproduce, or store confidential information on unauthorized personal devices or services',
    ndaObligation4: 'Implement adequate security measures to protect confidential information (encryption, strong passwords, two-factor authentication)',
    ndaObligation5: 'Immediately notify the CLIENT of any security breach, unauthorized access, or accidental disclosure',
    ndaObligation6: 'Not reverse engineer, decompile, or disassemble any project component',
    ndaObligation7: 'Not publish screenshots, demos, or project references in portfolios without express written authorization from the CLIENT',
    ndaSourceCode: 'SOURCE CODE PROTECTION',
    ndaSourceCodeText: 'The DEVELOPER specifically commits to:',
    ndaSourceCode1: 'Not share source code on public repositories (GitHub, GitLab, Bitbucket, etc.)',
    ndaSourceCode2: 'Not reuse proprietary components, modules, or libraries developed for this project in other projects',
    ndaSourceCode3: 'Use only private repositories authorized by the CLIENT for development',
    ndaSourceCode4: 'Delete all local copies of source code upon contract completion, providing written certification of said deletion',
    ndaSourceCode5: 'Not include backdoors, malicious code, or hidden unauthorized access in the delivered code',
    ndaNonCompete: 'NON-COMPETE CLAUSE',
    ndaNonCompeteText: 'The DEVELOPER commits to NOT develop, participate in, or advise on projects directly competitive with the CLIENT\'s project during the contract term and for a period of 24 months after termination. This includes real estate investment applications, property tokenization platforms, or similar financial services in the Ecuadorian and Latin American market.',
    ndaNonSolicit: 'NON-SOLICITATION CLAUSE',
    ndaNonSolicitText: 'The DEVELOPER commits not to solicit, hire, or attempt to hire employees, consultants, clients, or business partners of the CLIENT during the contract term and 12 months after termination.',
    ndaReturnMaterials: 'RETURN OF MATERIALS',
    ndaReturnText: 'Upon contract completion, whether by fulfillment, termination, or any other cause, the DEVELOPER must within a maximum of 48 hours:',
    ndaReturn1: 'Return all documentation, materials, and copies related to the project',
    ndaReturn2: 'Permanently delete all confidential information from all devices and cloud services',
    ndaReturn3: 'Revoke all access to repositories, servers, and project services',
    ndaReturn4: 'Provide a sworn statement confirming compliance with this clause',
    ndaSurvival: 'NDA SURVIVAL',
    ndaSurvivalText: 'The confidentiality obligations established in this section shall survive the termination of the contract for a period of FIVE (5) YEARS, regardless of the cause of termination.',
    ndaPenalty: 'NDA VIOLATION PENALTIES',
    ndaPenaltyText1: 'Violation of any confidentiality clause shall generate an IMMEDIATE penalty equivalent to 300% of the total contract value.',
    ndaPenaltyText2: 'Additionally, the DEVELOPER shall be liable for all direct, indirect, consequential, and punitive damages caused by the violation.',
    ndaPenaltyText3: 'The CLIENT may initiate criminal proceedings for trade secret violation, industrial espionage, and unfair competition under Ecuadorian laws (COIP - Comprehensive Criminal Code) and international law.',
    ndaPenaltyText4: 'In case of user data disclosure, the DEVELOPER shall assume full responsibility before data protection authorities under Ecuador\'s Organic Law on Personal Data Protection.',
    jurisdictionTitle: 'XI. JURISDICTION AND APPLICABLE LAW',
    jurisdictionText1: `This contract shall be governed by the laws of ${data.jurisdiction}.`,
    jurisdictionText2: `For any dispute arising from this contract, the parties submit to the jurisdiction of the competent courts of ${data.jurisdiction}, expressly waiving any other jurisdiction.`,
    jurisdictionText3: 'Additionally, the parties agree that this contract has international validity under the United Nations Convention on Contracts for the International Sale of Goods and applicable international treaties.',
    disputeTitle: 'XII. DISPUTE RESOLUTION',
    disputeText1: 'In case of dispute, the parties shall attempt to resolve it amicably during a period of 15 calendar days.',
    disputeText2: 'If an amicable agreement is not reached, international arbitration shall proceed before the International Chamber of Commerce.',
    disputeText3: 'The arbitral award shall be final, binding, and enforceable in any jurisdiction.',
    forceTitle: 'XIII. FORCE MAJEURE',
    forceText: 'Neither party shall be liable for non-compliance of obligations when caused by duly proven force majeure. However, the DEVELOPER must notify the CLIENT within 48 hours following the force majeure event.',
    terminationTitle: 'XIV. TERMINATION',
    terminationText1: 'The CLIENT may terminate this contract at any time with 15 days written notice.',
    terminationText2: 'In case of termination due to DEVELOPER non-compliance, all penalty and refund clauses established herein shall apply.',
    generalTitle: 'XV. GENERAL PROVISIONS',
    generalText1: 'This contract constitutes the complete agreement between the parties and replaces any prior agreement.',
    generalText2: 'Any modification must be in writing and signed by both parties.',
    generalText3: 'If any clause is declared void, the remaining shall remain in full force.',
    generalText4: 'This contract is signed in two copies of equal value, one for each party.',
    signaturesTitle: 'SIGNATURES',
    clientSig: 'THE CLIENT',
    developerSig: 'THE DEVELOPER',
    signLine: 'Signature',
    dateLine: 'Date',
    witnessTitle: 'WITNESSES',
    witness1: 'Witness 1',
    witness2: 'Witness 2',
    notaryTitle: 'NOTARIZATION',
    notaryText: 'This contract may be notarized before a public notary for greater legal validity.',
    legalNotice: 'LEGAL NOTICE: This contract has full legal validity under Ecuadorian and international law. Non-compliance with the obligations established herein shall give rise to civil and criminal actions in accordance with the law.',
  };

  return `<!DOCTYPE html>
<html lang="${isSpanish ? 'es' : 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${labels.contractNo}: ${data.contractNumber}</title>
  <style>
    @page { margin: 40px; size: A4; }
    @media print {
      .no-print { display: none !important; }
      body { padding: 20px !important; }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Georgia', 'Times New Roman', serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1a1a1a;
      background: #fff;
      padding: 40px;
    }
    .print-toolbar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 9999;
      background: #1a3a5c;
      padding: 10px 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.3);
    }
    .print-toolbar button {
      padding: 8px 20px;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: opacity 0.2s;
    }
    .print-toolbar button:hover { opacity: 0.85; }
    .btn-pdf {
      background: #2ECC71;
      color: #fff;
    }
    .btn-print {
      background: #3498DB;
      color: #fff;
    }
    .btn-close {
      background: rgba(255,255,255,0.15);
      color: #fff;
    }
    .toolbar-spacer { height: 52px; }
    .header {
      text-align: center;
      border-bottom: 3px double #1a3a5c;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .header-flag {
      font-size: 24px;
      margin-bottom: 8px;
    }
    .header h1 {
      font-size: 16pt;
      color: #1a3a5c;
      letter-spacing: 2px;
      margin-bottom: 4px;
    }
    .header h2 {
      font-size: 11pt;
      color: #c0392b;
      font-weight: 600;
      letter-spacing: 1px;
    }
    .contract-meta {
      display: flex;
      justify-content: space-between;
      margin-bottom: 25px;
      font-size: 10pt;
      color: #555;
    }
    .section {
      margin-bottom: 20px;
      page-break-inside: avoid;
    }
    .section-title {
      font-size: 12pt;
      font-weight: bold;
      color: #1a3a5c;
      border-bottom: 1px solid #ddd;
      padding-bottom: 6px;
      margin-bottom: 12px;
      text-transform: uppercase;
    }
    .party-box {
      background: #f8f9fa;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      padding: 15px;
      margin-bottom: 12px;
    }
    .party-box h4 {
      color: #1a3a5c;
      font-size: 10pt;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }
    .party-row {
      display: flex;
      margin-bottom: 4px;
      font-size: 10pt;
    }
    .party-label {
      font-weight: bold;
      min-width: 180px;
      color: #555;
    }
    .party-value {
      color: #1a1a1a;
    }
    p {
      margin-bottom: 10px;
      text-align: justify;
    }
    .clause-list {
      margin-left: 25px;
      margin-bottom: 12px;
    }
    .clause-list li {
      margin-bottom: 6px;
    }
    .highlight {
      background: #fff3cd;
      padding: 2px 4px;
      border-radius: 2px;
      font-weight: bold;
    }
    .penalty-box {
      background: #fde8e8;
      border: 2px solid #c0392b;
      border-radius: 6px;
      padding: 15px;
      margin: 15px 0;
    }
    .penalty-box p {
      color: #721c24;
      font-weight: 500;
    }
    .refund-box {
      background: #d4edda;
      border: 2px solid #28a745;
      border-radius: 6px;
      padding: 15px;
      margin: 15px 0;
    }
    .refund-box p {
      color: #155724;
    }
    .amount-display {
      font-size: 18pt;
      font-weight: bold;
      color: #1a3a5c;
      text-align: center;
      padding: 10px;
      background: #e8f0fe;
      border-radius: 6px;
      margin: 10px 0;
    }
    .signatures {
      margin-top: 40px;
      page-break-inside: avoid;
    }
    .sig-grid {
      display: flex;
      justify-content: space-between;
      gap: 40px;
      margin-top: 20px;
    }
    .sig-box {
      flex: 1;
      text-align: center;
    }
    .sig-line {
      border-top: 1px solid #1a1a1a;
      margin-top: 60px;
      padding-top: 8px;
      font-size: 10pt;
    }
    .sig-name {
      font-weight: bold;
      margin-top: 4px;
    }
    .sig-id {
      font-size: 9pt;
      color: #555;
    }
    .legal-notice {
      margin-top: 30px;
      padding: 15px;
      background: #1a3a5c;
      color: #fff;
      border-radius: 6px;
      font-size: 9pt;
      text-align: center;
      line-height: 1.5;
    }
    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 60pt;
      color: rgba(0,0,0,0.03);
      font-weight: bold;
      pointer-events: none;
      z-index: -1;
    }
    strong { color: #1a1a1a; }
  </style>
</head>
<body>
  <div class="print-toolbar no-print">
    <button class="btn-pdf" onclick="window.print()">
      &#128196; ${isSpanish ? 'Descargar PDF' : 'Download PDF'}
    </button>
    <button class="btn-print" onclick="window.print()">
      &#128424; ${isSpanish ? 'Imprimir' : 'Print'}
    </button>
    <button class="btn-close" onclick="window.close()">
      &#10005; ${isSpanish ? 'Cerrar' : 'Close'}
    </button>
  </div>
  <div class="toolbar-spacer no-print"></div>

  <div class="watermark">CONFIDENTIAL</div>

  ${data.brandingAppName || data.brandingCompanyName ? `
  <div class="branding-banner" style="background: ${data.brandingPrimaryColor || '#1a3a5c'}; padding: 18px 24px; border-radius: 8px; margin-bottom: 20px; display: flex; align-items: center; gap: 16px;">
    ${data.brandingLogoBase64 ? `<img src="data:image/jpeg;base64,${data.brandingLogoBase64}" style="width: 52px; height: 52px; border-radius: 10px; object-fit: cover; border: 2px solid ${data.brandingAccentColor || '#FFD700'};" />` : ''}
    <div>
      <div style="font-size: 16pt; font-weight: bold; color: ${data.brandingAccentColor || '#FFD700'}; letter-spacing: 1.5px; font-family: Arial, sans-serif;">${data.brandingAppName || ''}</div>
      ${data.brandingCompanyName ? `<div style="font-size: 10pt; color: rgba(255,255,255,0.85); margin-top: 2px;">${data.brandingCompanyName}</div>` : ''}
      ${data.brandingTagline ? `<div style="font-size: 9pt; color: rgba(255,255,255,0.6); font-style: italic; margin-top: 2px;">${data.brandingTagline}</div>` : ''}
      ${data.brandingWebsite ? `<div style="font-size: 9pt; color: ${data.brandingAccentColor || '#FFD700'}; margin-top: 3px;">${data.brandingWebsite}</div>` : ''}
    </div>
  </div>` : ''}
  
  <div class="header">
    <div class="header-flag">${isSpanish ? '🇪🇨' : '🌐'}</div>
    <h1>${labels.title}</h1>
    <h2>${labels.subtitle}</h2>
  </div>

  <div class="contract-meta">
    <span><strong>${labels.contractNo}:</strong> ${data.contractNumber}</span>
    <span><strong>${labels.dateLabel}:</strong> ${data.date}</span>
  </div>

  <div class="section">
    <div class="section-title">${labels.partiesTitle}</div>
    <div class="party-box">
      <h4>${labels.clientTitle}</h4>
      <div class="party-row"><span class="party-label">${labels.nameLabel}:</span><span class="party-value">${data.clientName}</span></div>
      <div class="party-row"><span class="party-label">${labels.idLabel}:</span><span class="party-value">${data.clientId}</span></div>
      <div class="party-row"><span class="party-label">${labels.addressLabel}:</span><span class="party-value">${data.clientAddress}</span></div>
      <div class="party-row"><span class="party-label">${labels.emailLabel}:</span><span class="party-value">${data.clientEmail}</span></div>
      <div class="party-row"><span class="party-label">${labels.phoneLabel}:</span><span class="party-value">${data.clientPhone}</span></div>
    </div>
    <div class="party-box">
      <h4>${labels.developerTitle}</h4>
      <div class="party-row"><span class="party-label">${labels.nameLabel}:</span><span class="party-value">${data.developerName}</span></div>
      <div class="party-row"><span class="party-label">${labels.idLabel}:</span><span class="party-value">${data.developerId}</span></div>
      <div class="party-row"><span class="party-label">${labels.addressLabel}:</span><span class="party-value">${data.developerAddress}</span></div>
      <div class="party-row"><span class="party-label">${labels.emailLabel}:</span><span class="party-value">${data.developerEmail}</span></div>
      <div class="party-row"><span class="party-label">${labels.phoneLabel}:</span><span class="party-value">${data.developerPhone}</span></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">${labels.objectTitle}</div>
    <div class="party-box">
      <div class="party-row"><span class="party-label">${labels.projectLabel}:</span><span class="party-value"><strong>${data.projectName}</strong></span></div>
    </div>
    <div style="background: #f0f8ff; border: 2px solid #1a3a5c; border-radius: 8px; padding: 18px; margin: 12px 0;">
      <h4 style="color: #1a3a5c; margin-bottom: 10px; font-size: 11pt; text-transform: uppercase; letter-spacing: 1px;">${labels.descriptionLabel}</h4>
      <p style="white-space: pre-wrap;">${data.projectDescription}</p>
    </div>
    ${data.projectObjectives && data.projectObjectives !== '_______________' ? `
    <div style="background: #f0fff4; border: 2px solid #27ae60; border-radius: 8px; padding: 18px; margin: 12px 0;">
      <h4 style="color: #27ae60; margin-bottom: 10px; font-size: 11pt; text-transform: uppercase; letter-spacing: 1px;">${labels.objectivesLabel}</h4>
      <p style="white-space: pre-wrap;">${data.projectObjectives}</p>
    </div>` : ''}
    ${data.projectPlatforms && data.projectPlatforms !== '_______________' ? `
    <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; padding: 18px; margin: 12px 0;">
      <h4 style="color: #2c3e50; margin-bottom: 10px; font-size: 11pt; text-transform: uppercase; letter-spacing: 1px;">${labels.platformsLabel}</h4>
      <p style="white-space: pre-wrap;">${data.projectPlatforms}</p>
    </div>` : ''}
    ${data.projectFeatures && data.projectFeatures !== '_______________' ? `
    <div style="background: #fff8f0; border: 2px solid #e67e22; border-radius: 8px; padding: 18px; margin: 12px 0;">
      <h4 style="color: #e67e22; margin-bottom: 10px; font-size: 11pt; text-transform: uppercase; letter-spacing: 1px;">${labels.featuresLabel}</h4>
      <p style="white-space: pre-wrap;">${data.projectFeatures}</p>
    </div>` : ''}
    ${data.projectTechStack && data.projectTechStack !== '_______________' ? `
    <div style="background: #f0f0ff; border: 2px solid #6c5ce7; border-radius: 8px; padding: 18px; margin: 12px 0;">
      <h4 style="color: #6c5ce7; margin-bottom: 10px; font-size: 11pt; text-transform: uppercase; letter-spacing: 1px;">${labels.techStackLabel}</h4>
      <p style="white-space: pre-wrap;">${data.projectTechStack}</p>
    </div>` : ''}
    ${data.projectDeliverables && data.projectDeliverables !== '_______________' ? `
    <div style="background: #e8f4fe; border: 2px solid #2980b9; border-radius: 8px; padding: 18px; margin: 12px 0;">
      <h4 style="color: #2980b9; margin-bottom: 10px; font-size: 11pt; text-transform: uppercase; letter-spacing: 1px;">${labels.deliverablesLabel}</h4>
      <p style="white-space: pre-wrap;">${data.projectDeliverables}</p>
    </div>` : ''}
    ${data.projectMilestones && data.projectMilestones !== '_______________' ? `
    <div style="background: #fff5f5; border: 2px solid #c0392b; border-radius: 8px; padding: 18px; margin: 12px 0;">
      <h4 style="color: #c0392b; margin-bottom: 10px; font-size: 11pt; text-transform: uppercase; letter-spacing: 1px;">${labels.milestonesLabel}</h4>
      <p style="white-space: pre-wrap;">${data.projectMilestones}</p>
    </div>` : ''}
    ${data.projectAcceptanceCriteria && data.projectAcceptanceCriteria !== '_______________' ? `
    <div style="background: #f0fff0; border: 2px solid #2ecc71; border-radius: 8px; padding: 18px; margin: 12px 0;">
      <h4 style="color: #2ecc71; margin-bottom: 10px; font-size: 11pt; text-transform: uppercase; letter-spacing: 1px;">${labels.acceptanceLabel}</h4>
      <p style="white-space: pre-wrap;">${data.projectAcceptanceCriteria}</p>
    </div>` : ''}
  </div>

  <div class="section">
    <div class="section-title">${labels.scopeTitle}</div>
    <p>${labels.scopeText}</p>
  </div>

  <div class="section">
    <div class="section-title">${labels.paymentTitle}</div>
    <div class="amount-display">
      <div style="font-size: 10pt; color: #555; margin-bottom: 4px;">${labels.contractAmountLabel}</div>
      ${data.currency} ${data.contractAmount || data.totalAmount}
    </div>
    <div class="amount-display" style="font-size: 14pt; background: #fff3cd; border: 2px solid #f0c040; margin-top: 8px;">
      <div style="font-size: 10pt; color: #555; margin-bottom: 4px;">${labels.totalAmount}</div>
      ${data.currency} ${data.totalAmount}
    </div>

    <div style="background: #e8f5e9; border: 2px solid #2e7d32; border-radius: 8px; padding: 18px; margin: 18px 0;">
      <h4 style="color: #2e7d32; margin-bottom: 12px; font-size: 11pt; text-transform: uppercase; letter-spacing: 1px;">&#127974; ${labels.paymentAccountTitle}</h4>
      <div class="party-row"><span class="party-label" style="min-width: 200px;">${labels.bankNameLabel}:</span><span class="party-value"><strong>${data.paymentBankName || '_______________'}</strong></span></div>
      <div class="party-row"><span class="party-label" style="min-width: 200px;">${labels.accountNumberLabel}:</span><span class="party-value"><strong style="font-size: 13pt; color: #1a3a5c; letter-spacing: 1px;">${data.paymentAccountNumber || '_______________'}</strong></span></div>
      <div class="party-row"><span class="party-label" style="min-width: 200px;">${labels.accountHolderLabel}:</span><span class="party-value"><strong>${data.paymentAccountHolder || '_______________'}</strong></span></div>
      <div class="party-row"><span class="party-label" style="min-width: 200px;">${labels.routingNumberLabel}:</span><span class="party-value"><strong>${data.paymentRoutingNumber || '_______________'}</strong></span></div>
    </div>

    <p><strong>${labels.paymentTerms}:</strong></p>
    <ul class="clause-list">
      <li>${labels.paymentText1}</li>
      <li>${labels.paymentText2}</li>
      <li>${labels.paymentText3}</li>
      <li>${labels.paymentText4}</li>
      <li><strong>${labels.paymentText5}</strong></li>
      <li><strong style="color: #c0392b;">${labels.paymentText6}</strong></li>
      <li><strong style="color: #c0392b;">${labels.paymentText7}</strong></li>
    </ul>
  </div>

  <div class="section">
    <div class="section-title">${labels.deliveryTitle}</div>
    <p>${labels.deliveryText}</p>
  </div>

  <div class="section">
    <div class="section-title">${labels.refundTitle}</div>
    <div class="refund-box">
      <p><strong>${labels.refundText1}</strong></p>
      <p>${labels.refundText2}</p>
      <p>${labels.refundText3}</p>
      <p>${labels.refundText4}</p>
    </div>
  </div>

  <div class="section">
    <div class="section-title">${labels.lawyerTitle}</div>
    <p><strong>${labels.lawyerText1}</strong></p>
    <p>${labels.lawyerText2}</p>
    <ul class="clause-list">
      <li>${labels.lawyerItem1}</li>
      <li>${labels.lawyerItem2}</li>
      <li>${labels.lawyerItem3}</li>
      <li>${labels.lawyerItem4}</li>
      <li>${labels.lawyerItem5}</li>
      <li>${labels.lawyerItem6}</li>
    </ul>
  </div>

  <div class="section">
    <div class="section-title">${labels.penaltyTitle}</div>
    <div class="penalty-box">
      <p>${labels.penaltyText1}</p>
      <p>${labels.penaltyText2}</p>
      <p><strong>${labels.penaltyText3}</strong></p>
      <p>${labels.penaltyText4}</p>
      <p><span class="highlight">${labels.penaltyText5}</span></p>
    </div>
  </div>

  <div class="section">
    <div class="section-title">${labels.ipTitle}</div>
    <p>${labels.ipText1}</p>
    <p>${labels.ipText2}</p>
    <p>${labels.ipText3}</p>
  </div>

  <div class="section" style="page-break-before: always;">
    <div class="section-title" style="color: #8B0000; border-bottom: 2px solid #8B0000;">${labels.confidentialTitle}</div>
    <p>${labels.confidentialText}</p>
    
    <div style="background: #f0f4ff; border: 2px solid #1a3a5c; border-radius: 8px; padding: 18px; margin: 15px 0;">
      <h4 style="color: #1a3a5c; margin-bottom: 10px; font-size: 11pt; text-transform: uppercase; letter-spacing: 1px;">10.1 ${labels.ndaScope}</h4>
      <p>${labels.ndaScopeText}</p>
      <ul class="clause-list">
        <li>${labels.ndaItem1}</li>
        <li>${labels.ndaItem2}</li>
        <li>${labels.ndaItem3}</li>
        <li>${labels.ndaItem4}</li>
        <li>${labels.ndaItem5}</li>
        <li>${labels.ndaItem6}</li>
        <li>${labels.ndaItem7}</li>
      </ul>
    </div>

    <div style="background: #fff8f0; border: 2px solid #e67e22; border-radius: 8px; padding: 18px; margin: 15px 0;">
      <h4 style="color: #e67e22; margin-bottom: 10px; font-size: 11pt; text-transform: uppercase; letter-spacing: 1px;">10.2 ${labels.ndaObligations}</h4>
      <ol class="clause-list">
        <li><strong>${labels.ndaObligation1}</strong></li>
        <li><strong>${labels.ndaObligation2}</strong></li>
        <li>${labels.ndaObligation3}</li>
        <li>${labels.ndaObligation4}</li>
        <li>${labels.ndaObligation5}</li>
        <li>${labels.ndaObligation6}</li>
        <li>${labels.ndaObligation7}</li>
      </ol>
    </div>

    <div style="background: #1a3a5c; color: #fff; border-radius: 8px; padding: 18px; margin: 15px 0;">
      <h4 style="color: #FFD700; margin-bottom: 10px; font-size: 11pt; text-transform: uppercase; letter-spacing: 1px;">10.3 ${labels.ndaSourceCode}</h4>
      <p style="color: #ddd;">${labels.ndaSourceCodeText}</p>
      <ul class="clause-list" style="color: #eee;">
        <li>${labels.ndaSourceCode1}</li>
        <li>${labels.ndaSourceCode2}</li>
        <li>${labels.ndaSourceCode3}</li>
        <li>${labels.ndaSourceCode4}</li>
        <li><strong style="color: #FF6B6B;">${labels.ndaSourceCode5}</strong></li>
      </ul>
    </div>

    <div style="background: #f8f0ff; border: 2px solid #8e44ad; border-radius: 8px; padding: 18px; margin: 15px 0;">
      <h4 style="color: #8e44ad; margin-bottom: 10px; font-size: 11pt; text-transform: uppercase; letter-spacing: 1px;">10.4 ${labels.ndaNonCompete}</h4>
      <p><strong>${labels.ndaNonCompeteText}</strong></p>
    </div>

    <div style="background: #f0fff4; border: 2px solid #27ae60; border-radius: 8px; padding: 18px; margin: 15px 0;">
      <h4 style="color: #27ae60; margin-bottom: 10px; font-size: 11pt; text-transform: uppercase; letter-spacing: 1px;">10.5 ${labels.ndaNonSolicit}</h4>
      <p>${labels.ndaNonSolicitText}</p>
    </div>

    <div style="background: #fff5f5; border: 1px solid #ddd; border-radius: 8px; padding: 18px; margin: 15px 0;">
      <h4 style="color: #c0392b; margin-bottom: 10px; font-size: 11pt; text-transform: uppercase; letter-spacing: 1px;">10.6 ${labels.ndaReturnMaterials}</h4>
      <p>${labels.ndaReturnText}</p>
      <ol class="clause-list">
        <li>${labels.ndaReturn1}</li>
        <li>${labels.ndaReturn2}</li>
        <li>${labels.ndaReturn3}</li>
        <li>${labels.ndaReturn4}</li>
      </ol>
    </div>

    <div style="background: #e8f4fe; border: 2px solid #2980b9; border-radius: 8px; padding: 18px; margin: 15px 0;">
      <h4 style="color: #2980b9; margin-bottom: 10px; font-size: 11pt; text-transform: uppercase; letter-spacing: 1px;">10.7 ${labels.ndaSurvival}</h4>
      <p><strong>${labels.ndaSurvivalText}</strong></p>
    </div>

    <div class="penalty-box" style="border-color: #8B0000; background: #fff0f0;">
      <h4 style="color: #8B0000; margin-bottom: 10px; font-size: 11pt; text-transform: uppercase; letter-spacing: 1px;">10.8 ${labels.ndaPenalty}</h4>
      <p style="color: #8B0000;"><strong>${labels.ndaPenaltyText1}</strong></p>
      <p style="color: #721c24;">${labels.ndaPenaltyText2}</p>
      <p style="color: #721c24;">${labels.ndaPenaltyText3}</p>
      <p style="color: #721c24;"><strong>${labels.ndaPenaltyText4}</strong></p>
    </div>
  </div>

  <div class="section">
    <div class="section-title">${labels.jurisdictionTitle}</div>
    <p>${labels.jurisdictionText1}</p>
    <p>${labels.jurisdictionText2}</p>
    <p>${labels.jurisdictionText3}</p>
  </div>

  <div class="section">
    <div class="section-title">${labels.disputeTitle}</div>
    <p>${labels.disputeText1}</p>
    <p>${labels.disputeText2}</p>
    <p>${labels.disputeText3}</p>
  </div>

  <div class="section">
    <div class="section-title">${labels.forceTitle}</div>
    <p>${labels.forceText}</p>
  </div>

  <div class="section">
    <div class="section-title">${labels.terminationTitle}</div>
    <p>${labels.terminationText1}</p>
    <p>${labels.terminationText2}</p>
  </div>

  <div class="section">
    <div class="section-title">${labels.generalTitle}</div>
    <p>${labels.generalText1}</p>
    <p>${labels.generalText2}</p>
    <p>${labels.generalText3}</p>
    <p>${labels.generalText4}</p>
  </div>

  <div class="signatures">
    <div class="section-title">${labels.signaturesTitle}</div>
    <div class="sig-grid">
      <div class="sig-box">
        <div class="sig-line">${labels.signLine}</div>
        <div class="sig-name">${data.clientName}</div>
        <div class="sig-id">${labels.idLabel}: ${data.clientId}</div>
        <div class="sig-id">${labels.dateLine}: _______________</div>
      </div>
      <div class="sig-box">
        <div class="sig-line">${labels.signLine}</div>
        <div class="sig-name">${data.developerName}</div>
        <div class="sig-id">${labels.idLabel}: ${data.developerId}</div>
        <div class="sig-id">${labels.dateLine}: _______________</div>
      </div>
    </div>

    <div class="sig-grid" style="margin-top: 30px;">
      <div class="sig-box">
        <div class="sig-line">${labels.witness1}</div>
        <div class="sig-id">${labels.nameLabel}: _______________</div>
        <div class="sig-id">${labels.idLabel}: _______________</div>
      </div>
      <div class="sig-box">
        <div class="sig-line">${labels.witness2}</div>
        <div class="sig-id">${labels.nameLabel}: _______________</div>
        <div class="sig-id">${labels.idLabel}: _______________</div>
      </div>
    </div>
  </div>

  <div style="margin-top: 30px; text-align: center; font-size: 9pt; color: #777;">
    <p><strong>${labels.notaryTitle}</strong></p>
    <p>${labels.notaryText}</p>
  </div>

  ${(data.attachedImages && data.attachedImages.length > 0) ? `
  <div class="section" style="page-break-before: always;">
    <div class="section-title">${isSpanish ? 'XVI. DOCUMENTOS ADJUNTOS / EVIDENCIA FOTOGRÁFICA' : 'XVI. ATTACHED DOCUMENTS / PHOTOGRAPHIC EVIDENCE'}</div>
    <p>${isSpanish ? 'Los siguientes documentos e imágenes forman parte integral del presente contrato como evidencia y referencia:' : 'The following documents and images are an integral part of this contract as evidence and reference:'}</p>
    <div style="display: flex; flex-wrap: wrap; gap: 16px; margin-top: 15px;">
      ${data.attachedImages.map((img, idx) => `
        <div style="border: 1px solid #ddd; border-radius: 8px; overflow: hidden; width: 100%; margin-bottom: 10px;">
          <div style="background: #f8f9fa; padding: 8px 12px; font-size: 10pt; font-weight: bold; color: #1a3a5c; border-bottom: 1px solid #ddd;">
            ${isSpanish ? 'Anexo' : 'Attachment'} ${idx + 1}: ${img.label}
          </div>
          <div style="padding: 10px; text-align: center;">
            <img src="data:image/jpeg;base64,${img.base64}" style="max-width: 100%; max-height: 400px; border-radius: 4px;" />
          </div>
        </div>
      `).join('')}
    </div>
  </div>` : ''}

  <div class="legal-notice" ${data.brandingPrimaryColor ? `style="background: ${data.brandingPrimaryColor};"` : ''}>
    ${labels.legalNotice}
    ${data.brandingCompanyName ? `<br/><br/><span style="font-size: 8pt; opacity: 0.7;">${isSpanish ? 'Generado por' : 'Generated by'} ${data.brandingAppName || ''} — ${data.brandingCompanyName}</span>` : ''}
  </div>
</body>
</html>`;
}
