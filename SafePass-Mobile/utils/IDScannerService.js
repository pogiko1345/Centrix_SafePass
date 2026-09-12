import ApiService from './ApiService';

const IDScannerService = {
  async verifyIDImage({ imageUri, backImageUri = '', idType = '', selectionProof = null } = {}) {
    const selectedIdType = String(idType || '').trim();
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
        idType: selectedIdType || null,
        imageUri,
        backImageUri,
        selectionProof,
      });
      return {
        isValid: Boolean(result?.isValid),
        status: result?.status || 'ai_precheck_error',
        verificationStatus: result?.verificationStatus || 'error',
        verificationProof: result?.verificationStatus === 'precheck_passed'
          ? result?.verificationProof || null : null,
        message: result?.message || 'ID pre-check finished. Please present your ID at the gate.',
        idType: result?.idType || selectedIdType || null,
        detectedIdType: result?.detectedIdType || null,
        detectedCategory: result?.detectedCategory || null,
        idTypeSelectionProof: result?.idTypeSelectionProof || null,
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
