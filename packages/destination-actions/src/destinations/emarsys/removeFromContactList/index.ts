import { IntegrationError, RetryableError } from '@segment/actions-core'
import type { ActionDefinition } from '@segment/actions-core'
import type { Settings } from '../generated-types'
import type { Payload } from './generated-types'
import {
  getContactLists,
  getFields,
  API_BASE,
  ContactListApiPayload,
  BufferBatchContactList,
  BufferBatchContactListItem
} from '../emarsys-helper'

const action: ActionDefinition<Settings, Payload> = {
  title: 'Remove from Contact List',
  description: '',
  fields: {
    contactlistid: {
      label: 'Id of the contact list',
      description: 'The Id of the contactlist',
      type: 'integer',
      required: true,
      dynamic: true
    },
    key_field: {
      label: 'Key field',
      description: 'The field to use to find the contact',
      type: 'string',
      required: true,
      dynamic: true
    },
    key_value: {
      label: 'Key value',
      description: 'Value for the key field used to find the contact. E.g. the email address  ',
      type: 'string',
      required: true,
      dynamic: false
    }
  },
  dynamicFields: {
    contactlistid: async (request) => {
      return getContactLists(request)
    },
    key_field: async (request) => {
      return getFields(request)
    }
  },
  perform: async (request, data) => {
    if (data.payload.key_value && data.payload.key_value != '') {
      data.payload.contactlistid = parseInt(data.payload.contactlistid.toString().replace(/[^0-9]/g, ''))

      if (data.payload.contactlistid > 0) {
        const payload: ContactListApiPayload = {
          contactlistid: data.payload.contactlistid,
          key_id: data.payload.key_field,
          external_ids: [data.payload.key_value]
        }
        // console.log(payload);

        const response = await request(`${API_BASE}contactlist/${data.payload.contactlistid}/delete`, {
          method: 'post',
          json: payload,
          throwHttpErrors: false
        })

        if (response && response.status && response.status == 200) {
          try {
            if (response.content != '') {
              const body = await response.json()
              if (body.replyCode !== undefined && body.replyCode == 0) {
                return response
              } else {
                throw new IntegrationError('Something went wront while deleting the contact to a contact list')
              }
            } else {
              return response // required to return the empty response for snapshot testing.
            }
          } catch (err) {
            throw new IntegrationError('Invalid JSON response')
          }
        } else if (response.status == 400) {
          throw new IntegrationError('The contact could not be deleted from the contact list')
        } else if (response.status == 429) {
          throw new RetryableError('Rate limit reached.')
        } else {
          throw new RetryableError('There seems to be an API issue.')
        }
      } else {
        throw new IntegrationError('ContactlistId must be >0')
      }
    } else {
      throw new IntegrationError('A key value is required')
    }
  },
  performBatch: async (request, data) => {
    if (data && data.payload && Array.isArray(data.payload)) {
      const batches: BufferBatchContactList = {}
      data.payload.forEach((payload: Payload) => {
        if (!batches[`${payload.contactlistid}-${payload.key_field}`]) {
          batches[`${payload.contactlistid}-${payload.key_field}`] = {
            contactlistid: payload.contactlistid,
            key_id: payload.key_field,
            external_ids: []
          }
        }
        batches[`${payload.contactlistid}-${payload.key_field}`].external_ids.push(payload.key_value)
      })

      for (const key in batches) {
        const batch: BufferBatchContactListItem = batches[key]
        const payload: ContactListApiPayload = {
          key_id: batch.key_id,
          external_ids: batch.external_ids
        }
        const response = await request(`${API_BASE}contactlist/${batch.contactlistid}/delete`, {
          method: 'post',
          json: payload,
          throwHttpErrors: false
        })

        if (response && response.status && response.status == 200) {
          // proceed with sending the next API batch
        } else if (response && response.status && response.status == 400) {
          // proceed with the next API-batch-request even there is a problem with the sent data of the current API-batch-request
        } else if (response && response.status && response.status == 429) {
          throw new RetryableError('Rate limit reached.')
        } else {
          throw new RetryableError('There seems to be an API issue.')
        }
      }
    }
  }
}

export default action
