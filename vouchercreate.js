const express = require('express');
const router = express.Router({
  caseSensitive: true,
});
const axios = require('axios');
const { ACTIVE_URL, ACTIVE_TOKEN } = require('./constants');
const { getCustomerDetailfromId, updateCustomerMetafields } = require('./customerhandler');

/**
 * @swagger
 * /api/voucher_create:
 *   post:
 *     summary: Create Voucher
 *     description: Create Voucher
 *     requestBody: 
 *       required: true
 *       content:
 *         application/json:
 *           
 *           schema:
 *             properties :
 *               code:
 *                type: string
 *               title:
 *                type: string
 *               value:
 *                type: string
 *               type:
 *                type: string
 *               customer_id:
 *                type: string
 *               createdData:
 *                type: date
 *               validTill:
 *                type: date
 *     responses:
 *       200:
 *         description: Successful response with details of User.
 *       404:
 *         description: User could not be found by given identifier.
 *       500:
 *         description: Error in Api calling
 */
router.post('/', async (req, res) => {
  try {
    const SHOP_NAME = ACTIVE_URL;
  const code = req.body.code
  const title = req.body.title
  let value = req.body.value
  const type = req.body.type
  const customer_id = req.body.customer_id
  const created_at = req.body.createdDate
  const expired_at = req.body.validTill
  let orderDiscountflag = false
  if(title.startsWith("CPL_")) {
    orderDiscountflag = true
  }
  let data;
  if (type == 'fixed') {
    data = {
      "discountAmount": {
        "amount": value,
        "appliesOnEachItem": false
      }
    }
  } else {
    value = value / 100
    data = {
      "percentage": value
    }
  }

  const url = `https://${SHOP_NAME}.myshopify.com/admin/api/2024-04/graphql.json`;

  const query_1 = `query getDiscount($code: String!) {
          codeDiscountNodeByCode(code: $code) {
              id
          }
      }`;
  const variables_1 = {
    "code": code
  }
  const query = `mutation discount_update($input: DiscountCodeBasicInput!) {
          discountCodeBasicCreate(basicCodeDiscount: $input) {
              codeDiscountNode {
              id
              }
              userErrors {
              code
              extraInfo
              field
              message
              }
          }
      }`;
  const variables = {
    "input": {
      "appliesOncePerCustomer": true,
      "code": code,
      "combinesWith": {
        "orderDiscounts": orderDiscountflag,
        "productDiscounts": title.startsWith("CPV_") ? false : true,
        "shippingDiscounts": false
      },
      "customerGets": {
        "items": {
          "all": true
        },
        "value": data
      },
      "customerSelection": {
        "customers": {
          "add": `gid://shopify/Customer/${customer_id}`
        }
      },
      "minimumRequirement": {
        "quantity": {
          "greaterThanOrEqualToQuantity": "1"
        }
      },
      "startsAt": `${created_at}`,
      "endsAt": `${expired_at}`,
      "title": title,
      "usageLimit": 1
    }
  }

  const query_2 = `mutation discountCodeActivate($id: ID!) {
      discountCodeActivate(id: $id) {
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

  var variables_2 = {
    "id": ''
  }
  const result = await shopify(query_1, variables_1)
  if(title.startsWith("CPV_") && result.data.codeDiscountNodeByCode !== null) {
    variables_2.id = result.data.codeDiscountNodeByCode.id
    const response = await shopify(query_2,variables_2)
    if(response.status === 200) {
      return res.status(200).send({
        status:true ,
        data: response.data
      })
    }
    else{
      return res.status(400).send({
        status:false,
        data: "error in reactivating coupon"
      })
    }
  }
  if (result.data.codeDiscountNodeByCode == null) {
    const final_res = await shopify(query, variables)
    variables_2.id = final_res.data && final_res.data.discountCodeBasicCreate && final_res.data.discountCodeBasicCreate.codeDiscountNode && final_res.data.discountCodeBasicCreate.codeDiscountNode.id ? final_res.data.discountCodeBasicCreate.codeDiscountNode.id : ''
    const res_data = await shopify(query_2, variables_2)
    if (res_data.status === 200 && res_data.data.discountCodeActivate && res_data.data.discountCodeActivate.codeDiscountNode.codeDiscount.title) {
      const metafields = await getCustomerDetailfromId(customer_id)
      let userMetafields = null
      if (metafields.status === "success") {
        let filteredmetafield = metafields.data && metafields.data.metafields.length > 0 && metafields.data.metafields.filter((meta) => {
          return meta.key === "loyalty_details"
        })
        if (filteredmetafield.length > 0) {
          userMetafields = JSON.parse(filteredmetafield[0].value)
        }
        let updatedmetafields = userMetafields ? [{ ...userMetafields[0], "loyaltydiscountcode": req.body.code , "points": value}] : [{ "loyaltydiscountcode": req.body.code, "points": value}]
        await updateCustomerMetafields(JSON.stringify(updatedmetafields), customer_id)
      }
      res.send(res_data)
    }
    else{
      res.status(res_data.status).send({
        status: false,
        data: res_data
      })
    }
  } else {
    res.send({ status: false, message: 'Already Created' })
  }

  async function shopify(query, variables) {
    try {
      const response = await axios.request({
        url,
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': ACTIVE_TOKEN,
          'Content-Type': 'application/json'
        },
        data: JSON.stringify({ query, variables })
      })
      const data = response.data.data
      return ({ status: 200, data })
    } catch (error) {
      console.log('Error:', error.message)
      return ({ status: 500, error })
    }
  }
  } catch (error) {
    res.status(500).send({
      status: false,
      data: error
    })
  }
  
})

module.exports = router