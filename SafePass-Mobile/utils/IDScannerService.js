import ApiService from './ApiService';

const IDScannerService = {
  async verifyIDImage({ imageUri, backImageUri = '', idType = '' } = {}) {
    const selectedIdType = String(idType || '').trim();
    if (!selectedIdType) {
      return {
        isValid: false,
        status: 'missing_id_type',
        verificationStatus: 'error',
        verificationProof: null,
        message: 'Choose the ID type before scanning.',
      };
    }
    if (!imageUri) {
      return {
        isValid: false,
        status: 'missing_image',
        verificationStatus: 'error',
        verificationProof: null,
        message: 'Add a clear front photo of your ID before scanning.',
      };
    }

    try {
      const result = await ApiService.validateAppointmentIdImage({
        idType: selectedIdType,
        imageUri,
        backImageUri,
      });
      return {
        isValid: Boolean(result?.isValid),
        status: result?.status || 'ai_precheck_error',
        verificationStatus: result?.verificationStatus || 'error',
        verificationProof: result?.verificationStatus === 'precheck_passed'
          ? result?.verificationProof || null : null,
        message: result?.message || 'ID pre-check finished. Please present your ID at the gate.',
        idType: selectedIdType,
        checkedAt: result?.checkedAt || null,
      };
    } catch (error) {
      console.error('Backend ID pre-check error.');
      return {
        isValid: false,
        status: 'ai_precheck_error',
        verificationStatus: 'error',
        verificationProof: null,
        message: error?.status === 400
          ? error.message
          : 'ID pre-check is unavailable. Please retry or present your ID at the gate.',
      };
    }
  },
};

export default IDScannerService;
