import type {
  TitleCompany,
  TitleCompanyAssignment,
  PropertyDocumentSubmission,
} from '@/types';

export { REQUIRED_TITLE_DOCUMENTS } from '@/constants/platform-config';

export const titleCompanies: TitleCompany[] = [];
export const titleCompanyAssignments: TitleCompanyAssignment[] = [];
export const propertyDocumentSubmissions: PropertyDocumentSubmission[] = [];

export const getTitleCompanyById = (id: string): TitleCompany | undefined => {
  return titleCompanies.find((tc) => tc.id === id);
};

export const getSubmissionByPropertyId = (propertyId: string): PropertyDocumentSubmission | undefined => {
  return propertyDocumentSubmissions.find((s) => s.propertyId === propertyId);
};

export const getAssignmentsForCompany = (companyId: string): TitleCompanyAssignment[] => {
  return titleCompanyAssignments.filter((a) => a.titleCompanyId === companyId);
};
