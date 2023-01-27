import { UserService } from '@/services/UserService'
import { ActionTree } from 'vuex'
import RootState from '@/store/RootState'
import UserState from './UserState'
import * as types from './mutation-types'
import { hasError, showToast } from '@/utils'
import { translate } from '@/i18n'
import { updateInstanceUrl, updateToken, resetConfig } from '@/adapter'
import logger from "@/logger";

const actions: ActionTree<UserState, RootState> = {

  /**
 * Login user and return token
 */
  async login ({ commit, dispatch }, { username, password }) {
    try {
      const resp = await UserService.login(username, password)
      if (resp.status === 200 && resp.data) {
        if (resp.data.token) {
          const permissionId = process.env.VUE_APP_PERMISSION_ID;
          if (permissionId) {
            const checkPermissionResponse = await UserService.checkPermission({
              data: {
                permissionId
              },
              headers: {
                Authorization:  'Bearer ' + resp.data.token,
                'Content-Type': 'application/json'
              }
            });

            if (checkPermissionResponse.status === 200 && !hasError(checkPermissionResponse) && checkPermissionResponse.data && checkPermissionResponse.data.hasPermission) {
              commit(types.USER_TOKEN_CHANGED, { newToken: resp.data.token })
              updateToken(resp.data.token)
              dispatch('getProfile')
              dispatch('setDateTimeFormat', process.env.VUE_APP_DATE_FORMAT ? process.env.VUE_APP_DATE_FORMAT : 'MM/dd/yyyy');
              if (resp.data._EVENT_MESSAGE_ && resp.data._EVENT_MESSAGE_.startsWith("Alert:")) {
              // TODO Internationalise text
                showToast(translate(resp.data._EVENT_MESSAGE_));
              }
              return resp.data;
            } else {
              const permissionError = 'You do not have permission to access the app.';
              showToast(translate(permissionError));
              logger.error("error", permissionError);
              return Promise.reject(new Error(permissionError));
            }
          } else {
            commit(types.USER_TOKEN_CHANGED, { newToken: resp.data.token })
            updateToken(resp.data.token)
            dispatch('getProfile')
            dispatch('setDateTimeFormat', process.env.VUE_APP_DATE_FORMAT ? process.env.VUE_APP_DATE_FORMAT : 'MM/dd/yyyy');
            return resp.data;
          }
        } else if (hasError(resp)) {
          showToast(translate('Sorry, your username or password is incorrect. Please try again.'));
          logger.error("error", resp.data._ERROR_MESSAGE_);
          return Promise.reject(new Error(resp.data._ERROR_MESSAGE_));
        }
      } else {
        showToast(translate('Something went wrong'));
        logger.error("error", resp.data._ERROR_MESSAGE_);
        return Promise.reject(new Error(resp.data._ERROR_MESSAGE_));
      }
    } catch (err: any) {
      showToast(translate('Something went wrong'));
      logger.error("error", err);
      return Promise.reject(new Error(err))
    }
    // return resp
  },

  /**
   * Logout user
   */
  async logout ({ commit }) {
    // TODO add any other tasks if need
    commit(types.USER_END_SESSION)
    resetConfig();
    this.dispatch('order/clearOrderList');
    // clearning field mappings and current mapping when user logout
    commit(types.USER_FIELD_MAPPING_UPDATED, {})
    commit(types.USER_CURRENT_FIELD_MAPPING_UPDATED, {})
  },

  /**
   * Get User profile
   */
  async getProfile ( { commit, dispatch }) {
    const resp = await UserService.getProfile()
    if (resp.status === 200) {
      dispatch('getFieldMappings')
      commit(types.USER_INFO_UPDATED, resp.data);
    }
  },

  /**
   * update current facility information
   */
  async setFacility ({ commit }, payload) {
    commit(types.USER_CURRENT_FACILITY_UPDATED, payload.facility);
  },

  setDateTimeFormat ({ commit }, payload) {
    commit(types.USER_DATETIME_FORMAT_UPDATED, payload)
  },
  
  /**
   * Update user timeZone
   */
  async setUserTimeZone ( { state, commit }, payload) {
    const resp = await UserService.setUserTimeZone(payload)
    if (resp.status === 200 && !hasError(resp)) {
      const current: any = state.current;
      current.userTimeZone = payload.tzId;
      commit(types.USER_INFO_UPDATED, current);
      showToast(translate("Time zone updated successfully"));
    }
  },

  /**
   * Set User Instance Url
   */
  setUserInstanceUrl ({ commit }, payload){
    commit(types.USER_INSTANCE_URL_UPDATED, payload)
    updateInstanceUrl(payload)
  },

  async getFieldMappings({ commit }) {
    try {
      const payload = {
        "inputFields": {
          "mappingPrefTypeEnumId": "IMPORT_MAPPING_PREF"
        },
        "fieldList": ["mappingPrefName", "mappingPrefId", "mappingPrefValue"],
        "viewSize": 20, // considered a user won't have more than 20 saved mappings
        "entityName": "DataManagerMapping"
      }

      const resp = await UserService.getFieldMappings(payload);

      if(resp.status == 200 && !hasError(resp) && resp.data.count > 0) {

        // updating the structure for mappings so as to directly store it in state
        const fieldMappings = resp.data.docs.reduce((mappings: any, fieldMapping: any) => {
          mappings[fieldMapping.mappingPrefId] = {
            name: fieldMapping.mappingPrefName,
            value: JSON.parse(fieldMapping.mappingPrefValue)
          }
          return mappings;
        }, {})

        commit(types.USER_FIELD_MAPPING_UPDATED, fieldMappings)
      } else {
        console.error('Failed to fetch user mapping preferences')
      }
    } catch(err) {
      console.error(err)
    }
  },

  async createFieldMapping({ commit }, payload) {
    try {

      const params = {
        mappingPrefId: payload.id,
        mappingPrefName: payload.name,
        mappingPrefValue: JSON.stringify(payload.value),
        mappingPrefTypeEnumId: 'IMPORT_MAPPING_PREF'
      }

      const resp = await UserService.createFieldMapping(params);

      if(resp.status == 200 && !hasError(resp)) {

        const fieldMapping = {
          id: resp.data.mappingPrefId,
          name: payload.name,
          value: payload.value
        }

        commit(types.USER_FIELD_MAPPING_CREATED, fieldMapping)
        showToast(translate('Field mapping preference created'))
      } else {
        console.error('Failed to create field mapping preference')
        showToast(translate('Failed to create field mapping preference'))
      }
    } catch(err) {
      console.error(err)
      showToast(translate('Failed to create field mapping preference'))
    }
  },

  async updateFieldMapping({ commit }, payload) {
    try {

      const params = {
        mappingPrefId: payload.id,
        mappingPrefName: payload.name,
        mappingPrefValue: JSON.stringify(payload.value),
        mappingPrefTypeEnumId: 'IMPORT_MAPPING_PREF'
      }

      const resp = await UserService.updateFieldMapping(params);

      if(resp.status == 200 && !hasError(resp)) {

        const fieldMapping = {
          id: payload.id,
          name: payload.name,
          value: payload.value
        }

        commit(types.USER_FIELD_MAPPING_UPDATED, fieldMapping)
        showToast(translate('Field mapping preference updated'))
      } else {
        console.error('Failed to update field mapping preference')
        showToast(translate('Failed to update field mapping preference'))
      }
    } catch(err) {
      console.error(err)
      showToast(translate('Failed to update field mapping preference'))
    }
  },

  async deleteFieldMapping({ commit }, mappingId) {
    try {
      const resp = await UserService.deleteFieldMapping({
        'mappingPrefId': mappingId
      });

      if(resp.status == 200 && !hasError(resp)) {
        commit(types.USER_FIELD_MAPPING_DELETED, mappingId)
        showToast(translate('Field mapping preference deleted'))
      } else {
        console.error('Failed to delete field mapping preference')
        showToast(translate('Failed to delete field mapping preference'))
      }
    } catch(err) {
      console.error(err)
      showToast(translate('Failed to delete field mapping preference'))
    }
  },

  async updateCurrentMapping({ commit }, payload) {
    commit(types.USER_CURRENT_FIELD_MAPPING_UPDATED, payload)
  }
}

export default actions;