import {
  TitleCompany,
  TitleCompanyAssignment,
  TitleDocument,
  TitleDocumentType,
  PropertyDocumentSubmission,
} from '@/types';

export const REQUIRED_TITLE_DOCUMENTS: {
  type: TitleDocumentType;
  name: string;
  description: string;
}[] = [
  {
    type: 'title_insurance',
    name: 'Title Insurance Commitment & Policy',
    description:
      'Document confirming the property is free of liens or issues, and the policy protecting the lender\'s interest.',
  },
  {
    type: 'alta_settlement',
    name: 'ALTA Settlement Statement',
    description:
      'Detailed, itemized list of all closing costs, fees, and payments for both buyer and seller.',
  },
  {
    type: 'warranty_deed',
    name: 'Warranty Deed / Conveyance Documents',
    description:
      'The legal document transferring ownership of the property.',
  },
  {
    type: 'closing_protection_letter',
    name: 'Closing Protection Letter (CPL)',
    description:
      'Protects the lender against errors or dishonesty by the closing agent.',
  },
  {
    type: 'property_tax_info',
    name: 'Property Tax Information & Tax Certificates',
    description:
      'Verifies status of property taxes for escrow purposes.',
  },
  {
    type: 'affidavits',
    name: 'Affidavits',
    description:
      'Sworn statements, including seller no-lien affidavit and affidavits regarding property occupancy.',
  },
  {
    type: 'wire_instructions',
    name: 'Wire Instructions',
    description:
      'Verified, secure instructions for transferring closing funds.',
  },
  {
    type: 'survey',
    name: 'Survey',
    description:
      'Required by the lender to identify property boundaries.',
  },
];

export const titleCompanies: TitleCompany[] = [
  {
    id: 'tc-1',
    name: 'First American Title Insurance',
    contactName: 'Sarah Mitchell',
    email: 'sarah.mitchell@firstamerican.com',
    phone: '+1 (555) 234-5678',
    address: '1 First American Way',
    city: 'Santa Ana',
    state: 'CA',
    licenseNumber: 'CA-TI-2024-8821',
    status: 'active',
    assignedProperties: ['1', '2'],
    completedReviews: 47,
    averageReviewDays: 3.2,
    createdAt: '2024-01-15T00:00:00Z',
  },
  {
    id: 'tc-2',
    name: 'Fidelity National Title Group',
    contactName: 'James Robertson',
    email: 'j.robertson@fntg.com',
    phone: '+1 (555) 345-6789',
    address: '601 Riverside Avenue',
    city: 'Jacksonville',
    state: 'FL',
    licenseNumber: 'FL-TI-2024-5543',
    status: 'active',
    assignedProperties: ['5'],
    completedReviews: 62,
    averageReviewDays: 2.8,
    createdAt: '2024-02-10T00:00:00Z',
  },
  {
    id: 'tc-3',
    name: 'Old Republic Title Company',
    contactName: 'Maria Gonzalez',
    email: 'mgonzalez@oldrepublic.com',
    phone: '+1 (555) 456-7890',
    address: '400 Second Avenue South',
    city: 'Minneapolis',
    state: 'MN',
    licenseNumber: 'MN-TI-2024-3312',
    status: 'active',
    assignedProperties: [],
    completedReviews: 34,
    averageReviewDays: 4.1,
    createdAt: '2024-03-05T00:00:00Z',
  },
  {
    id: 'tc-4',
    name: 'Stewart Title Guaranty',
    contactName: 'David Chen',
    email: 'dchen@stewart.com',
    phone: '+1 (555) 567-8901',
    address: '1360 Post Oak Blvd',
    city: 'Houston',
    state: 'TX',
    licenseNumber: 'TX-TI-2024-7789',
    status: 'pending_verification',
    assignedProperties: [],
    completedReviews: 0,
    averageReviewDays: 0,
    createdAt: '2025-01-20T00:00:00Z',
  },
];

export const titleCompanyAssignments: TitleCompanyAssignment[] = [
  {
    id: 'tca-1',
    propertyId: '1',
    propertyName: 'Marina Bay Residences',
    propertyAddress: '123 Marina Boulevard, Dubai',
    titleCompanyId: 'tc-1',
    titleCompanyName: 'First American Title Insurance',
    assignedAt: '2025-01-20T00:00:00Z',
    assignedBy: 'Admin Owner',
    status: 'in_review',
  },
  {
    id: 'tca-2',
    propertyId: '2',
    propertyName: 'Manhattan Office Tower',
    propertyAddress: '500 Fifth Avenue, New York',
    titleCompanyId: 'tc-1',
    titleCompanyName: 'First American Title Insurance',
    assignedAt: '2025-01-22T00:00:00Z',
    assignedBy: 'Admin Owner',
    status: 'completed',
    completedAt: '2025-01-28T00:00:00Z',
  },
  {
    id: 'tca-3',
    propertyId: '5',
    propertyName: 'Paris Retail Complex',
    propertyAddress: 'Champs-Elysees, Paris',
    titleCompanyId: 'tc-2',
    titleCompanyName: 'Fidelity National Title Group',
    assignedAt: '2025-02-01T00:00:00Z',
    assignedBy: 'Admin Owner',
    status: 'assigned',
  },
];

const createDocumentsForProperty = (
  propertyId: string,
  statuses: Partial<Record<TitleDocumentType, { status: TitleDocument['status']; fileName?: string }>>
): TitleDocument[] => {
  return REQUIRED_TITLE_DOCUMENTS.map((doc, idx) => {
    const override = statuses[doc.type];
    return {
      id: `td-${propertyId}-${idx}`,
      propertyId,
      type: doc.type,
      name: doc.name,
      description: doc.description,
      fileName: override?.fileName,
      fileUri: override?.fileName ? `#uploaded-${doc.type}` : undefined,
      status: override?.status ?? 'not_uploaded',
      uploadedAt: override?.status && override.status !== 'not_uploaded' ? '2025-01-20T00:00:00Z' : undefined,
      required: true,
    };
  });
};

export const propertyDocumentSubmissions: PropertyDocumentSubmission[] = [
  {
    id: 'pds-1',
    propertyId: '1',
    propertyName: 'Marina Bay Residences',
    propertyAddress: '123 Marina Boulevard, Dubai',
    ownerId: 'owner-1',
    ownerName: 'Ahmed Al-Rashid',
    ownerEmail: 'ahmed@marinabay.ae',
    documents: createDocumentsForProperty('1', {
      title_insurance: { status: 'approved', fileName: 'title_insurance_marina.pdf' },
      alta_settlement: { status: 'approved', fileName: 'alta_marina.pdf' },
      warranty_deed: { status: 'under_review', fileName: 'deed_marina.pdf' },
      closing_protection_letter: { status: 'uploaded', fileName: 'cpl_marina.pdf' },
      property_tax_info: { status: 'uploaded', fileName: 'tax_info_marina.pdf' },
      affidavits: { status: 'uploaded', fileName: 'affidavits_marina.pdf' },
      wire_instructions: { status: 'approved', fileName: 'wire_marina.pdf' },
      survey: { status: 'not_uploaded' },
    }),
    status: 'in_review',
    assignedTitleCompanyId: 'tc-1',
    assignedTitleCompanyName: 'First American Title Insurance',
    submittedAt: '2025-01-18T00:00:00Z',
    reviewStartedAt: '2025-01-20T00:00:00Z',
    tokenizationApproved: false,
    createdAt: '2025-01-10T00:00:00Z',
  },
  {
    id: 'pds-2',
    propertyId: '2',
    propertyName: 'Manhattan Office Tower',
    propertyAddress: '500 Fifth Avenue, New York',
    ownerId: 'owner-2',
    ownerName: 'Robert Sterling',
    ownerEmail: 'rsterling@manhattantower.com',
    documents: createDocumentsForProperty('2', {
      title_insurance: { status: 'approved', fileName: 'title_insurance_manhattan.pdf' },
      alta_settlement: { status: 'approved', fileName: 'alta_manhattan.pdf' },
      warranty_deed: { status: 'approved', fileName: 'deed_manhattan.pdf' },
      closing_protection_letter: { status: 'approved', fileName: 'cpl_manhattan.pdf' },
      property_tax_info: { status: 'approved', fileName: 'tax_info_manhattan.pdf' },
      affidavits: { status: 'approved', fileName: 'affidavits_manhattan.pdf' },
      wire_instructions: { status: 'approved', fileName: 'wire_manhattan.pdf' },
      survey: { status: 'approved', fileName: 'survey_manhattan.pdf' },
    }),
    status: 'approved',
    assignedTitleCompanyId: 'tc-1',
    assignedTitleCompanyName: 'First American Title Insurance',
    submittedAt: '2025-01-15T00:00:00Z',
    reviewStartedAt: '2025-01-18T00:00:00Z',
    completedAt: '2025-01-28T00:00:00Z',
    tokenizationApproved: true,
    createdAt: '2025-01-08T00:00:00Z',
  },
  {
    id: 'pds-3',
    propertyId: '5',
    propertyName: 'Paris Retail Complex',
    propertyAddress: 'Champs-Elysees, Paris',
    ownerId: 'owner-3',
    ownerName: 'Jean-Pierre Dupont',
    ownerEmail: 'jpdupont@parisretail.fr',
    documents: createDocumentsForProperty('5', {
      title_insurance: { status: 'uploaded', fileName: 'title_insurance_paris.pdf' },
      alta_settlement: { status: 'uploaded', fileName: 'alta_paris.pdf' },
      warranty_deed: { status: 'uploaded', fileName: 'deed_paris.pdf' },
    }),
    status: 'submitted',
    assignedTitleCompanyId: 'tc-2',
    assignedTitleCompanyName: 'Fidelity National Title Group',
    submittedAt: '2025-02-01T00:00:00Z',
    tokenizationApproved: false,
    createdAt: '2025-01-28T00:00:00Z',
  },
  {
    id: 'pds-4',
    propertyId: '6',
    propertyName: 'Tokyo Mixed-Use Tower',
    propertyAddress: 'Shibuya District, Tokyo',
    ownerId: 'owner-4',
    ownerName: 'Takeshi Yamamoto',
    ownerEmail: 'tyamamoto@tokyotower.jp',
    documents: createDocumentsForProperty('6', {}),
    status: 'draft',
    tokenizationApproved: false,
    createdAt: '2025-02-10T00:00:00Z',
  },
];

export const getTitleCompanyById = (id: string): TitleCompany | undefined => {
  return titleCompanies.find((tc) => tc.id === id);
};

export const getSubmissionByPropertyId = (propertyId: string): PropertyDocumentSubmission | undefined => {
  return propertyDocumentSubmissions.find((s) => s.propertyId === propertyId);
};

export const getAssignmentsForCompany = (companyId: string): TitleCompanyAssignment[] => {
  return titleCompanyAssignments.filter((a) => a.titleCompanyId === companyId);
};
