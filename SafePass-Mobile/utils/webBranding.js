import Constants from 'expo-constants';
import appConfig from '../app.json';

export const WEB_VERSION_LABEL = `SafePass Smart Campus v${Constants.expoConfig?.version || appConfig.expo.version}`;
