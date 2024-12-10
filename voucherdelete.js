const express = require('express');
const router = express.Router({
  caseSensitive: true,
});
const axios = require('axios');
const { ACTIVE_URL, ACTIVE_TOKEN } = require('./constants');
const { getCustomerDetailfromId, updateCustomerMetafields } = require('./customerhandler');

router.post('/', async (req, res) => {
  try {
    const discountCode = req.body.discountCode
    const customer_id = req.body.customer_id
    const query = `query codeDiscountNodeByCode($code: String!) {
        codeDiscountNodeByCode(code: $code) {
          codeDiscount {
            __typename
            ... on DiscountCodeBasic {
              codesCount {
                count
              }
              shortSummary
              title
            }
          }
          id
        }
      }`
    const variables = {
        "code": discountCode
    }

    const SHOP_NAME = ACTIVE_URL;

    const url = `https://${SHOP_NAME}.myshopify.com/admin/api/2024-04/graphql.json`;

    const response = await axios.request({
        url,
        method: 'POST',
        headers: {
            'X-Shopify-Access-Token': ACTIVE_TOKEN,
            'Content-Type': 'application/json'
        },
        data: JSON.stringify({ query, variables })
    })
    if (response.status === 200 && response.data.data && response.data.data.codeDiscountNodeByCode && response.data.data.codeDiscountNodeByCode.id) {
        const data = response.data.data
        const couponID = data.codeDiscountNodeByCode.id
        const query_1 = `mutation discountCodeDeactivate($id: ID!) {
            discountCodeDeactivate(id: $id) {
              codeDiscountNode {
                codeDiscount {
                  ... on DiscountCodeBasic {
                    title
                    status
                    startsAt
                    endsAt
                  }
                }
              }
              userErrors {
                field
                code
                message
              }
            }
          }`
        const variable_1 = {
            "id": couponID
        }
        const response_1 = await axios.request({
            url,
            method: 'POST',
            headers: {
                'X-Shopify-Access-Token': ACTIVE_TOKEN,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({ query: query_1, variables: variable_1 })
        })
        if (response_1.status === 200 && response_1.data.data && response_1.data.data.discountCodeDeactivate) {
            let data2 = JSON.stringify({
                "metafield": {
                    "namespace": "customer",
                    "key": "loyalty_details",
                    "value": "[{}]",
                    "type": "json"
                }
            });

            let config2 = {
                method: 'post',
                maxBodyLength: Infinity,
                url: `https://${ACTIVE_URL}.myshopify.com/admin/api/2024-07/customers/${customer_id}/metafields.json`,
                headers: {
                    'X-Shopify-Access-Token': ACTIVE_TOKEN,
                    'Content-Type': 'application/json'
                },
                data: data2
            };

            axios.request(config2)
                .then((response) => {
                    return res.status(200).send({
                        status: true,
                        data: response.data
                    })
                })
                .catch((error) => {
                    return res.status(response.status).send({
                        status: false,
                        data: error
                    });
                });
        }
        else {
            return res.status(response_1.status).send({
                status: false,
                data: response_1.data
            })
        }
    }
    else {
        return res.status(response.status).send({
            status: false,
            data: response.data
        })
    }
} catch (error) {
    res.status(500).send({
      status: false,
      data: error
    })
  }
  
})

module.exports = router