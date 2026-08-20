/* ============================================================================
   Master lists — ported from v1 data.js. The GST treatment and place of
   supply drive the tax split, so they live here beside the money math.
   ========================================================================== */

export const SALUTATIONS = ['', 'Mr.', 'Mrs.', 'Ms.', 'Miss', 'Dr.'];

export const LANGUAGES = ['English', 'Tamil', 'Hindi', 'Telugu', 'Malayalam', 'Kannada'];

export const CURRENCIES = [
  'INR - Indian Rupee', 'USD - US Dollar', 'AED - UAE Dirham', 'SGD - Singapore Dollar',
];

export const GST_TREATMENTS = [
  'Registered Business - Regular',
  'Registered Business - Composition',
  'Unregistered Business',
  'Consumer',
  'Overseas',
  'Special Economic Zone',
  'Deemed Export',
  'Tax Deductor',
  'SEZ Developer',
];

export const PAYMENT_TERMS = [
  'Due on Receipt', 'Net 15', 'Net 30', 'Net 45', 'Net 60',
  'Due end of the month', 'Due end of next month',
];

/** Place of supply — against the home state this decides CGST+SGST vs IGST. */
export const STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar',
  'Chandigarh', 'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka',
  'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim',
  'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

export const COUNTRIES = [
  'India', 'United Arab Emirates', 'Singapore', 'Sri Lanka', 'Malaysia', 'United States',
];

export interface AddressBlock {
  attention?: string;
  country?: string;
  street1?: string;
  street2?: string;
  city?: string;
  state?: string;
  pin?: string;
  phone?: string;
}

export interface ContactPerson {
  salutation?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  workPhone?: string;
  mobile?: string;
}

export interface ClientDoc {
  name: string;
  size: number;
  type: string;
  data: string; // data URL
}
