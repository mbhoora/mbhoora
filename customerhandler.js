const axios = require('axios');
const { ACTIVE_TOKEN, ACTIVE_URL } = require('./constants');


module.exports.getCustomerDetailfromId = getCustomerDetailfromId;
async function getCustomerDetailfromId(customer_id) {
    try {
        let url = `https://${ACTIVE_URL}.myshopify.com/admin/api/2024-07/customers/${customer_id}/metafields.json`
        return axios.get(url, {
            headers: {
                'X-Shopify-Access-Token': ACTIVE_TOKEN,
                'Content-Type': 'application/json'
            }
        })
            .then((response) => {
                if (response.status === 200) {
                    return {
                        status: "success",
                        data: response.data
                    }
                }
                else {
                    return {
                        status: "failure",
                        data: response.data
                    }
                }
            })
            .catch((err) => {
                return {
                    status: "failure",
                    data: err
                }
            })
    } catch (error) {
        return {
            status: "failure",
            data: error
        }
    }
}

module.exports.updateCustomerMetafields = updateCustomerMetafields
async function updateCustomerMetafields(metafield_value, customer_id) {
    try {
        let data2 = JSON.stringify({
            "metafield": {
                "namespace": "customer",
                "key": "loyalty_details",
                "value": metafield_value,
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

        return axios.request(config2)
            .then((response) => {
                return {
                    status: "success",
                    data: response.data
                }
            })
            .catch((error) => {
                return {
                    status: "failure",
                    data: error
                }
            });
    } catch (error) {
        return {
            status: "failure",
            data: error
        }
    }
}

module.exports.updateOrderMetafields = updateOrderMetafields
async function updateOrderMetafields(metafield_value, order_id) {
    try {
        let data2 = JSON.stringify({
            "metafield": {
                "namespace": "global",
                "key": "customer_capillary_data",
                "value": metafield_value,
                "type": "json"
            }
        });

        let config2 = {
            method: 'post',
            maxBodyLength: Infinity,
            url: `https://${ACTIVE_URL}.myshopify.com/admin/api/2024-07/orders/${order_id}/metafields.json`,
            headers: {
                'X-Shopify-Access-Token': ACTIVE_TOKEN,
                'Content-Type': 'application/json'
            },
            data: data2
        };

        return axios.request(config2)
            .then((response) => {
                return {
                    status: "success",
                    data: response.data
                }
            })
            .catch((error) => {
                return {
                    status: "failure",
                    data: error
                }
            });
    } catch (error) {
        return {
            status: "failure",
            data: error
        }
    }
}

module.exports.getCouponDatabyCode = getCouponDatabyCode
async function getCouponDatabyCode(discount_applications) {
    const url = `https://${ACTIVE_URL}.myshopify.com/admin/api/2024-04/graphql.json`;
    const discountQuery = `
        query codeDiscountNodeByCode($code: String!) {
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
        }
    `;

    const variable_discount = {
        code: ''
    };

    let capillary_discount = null;

    const promises = discount_applications.map(async (discount_data) => {
        variable_discount.code = discount_data.code;
        try {
            const response = await axios.request({
                url,
                method: 'POST',
                headers: {
                    'X-Shopify-Access-Token': ACTIVE_TOKEN,
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify({ query: discountQuery, variables: variable_discount })
            });
            const data = response.data.data.codeDiscountNodeByCode.codeDiscount.title;
            if (data && data.startsWith('CPL_') || data.startsWith('CPV_')) {
                capillary_discount = data
                return 
            }
        } catch (error) {
            return
        }
    });

    await Promise.all(promises);

    return capillary_discount;
}


module.exports.getOrderById = getOrderById
async function getOrderById(order_id) {
    try {
        let config2 = {
            method: 'get',
            maxBodyLength: Infinity,
            url: `https://${ACTIVE_URL}.myshopify.com/admin/api/2024-07/orders/${order_id}.json`,
            headers: {
                'X-Shopify-Access-Token': ACTIVE_TOKEN,
                'Content-Type': 'application/json'
            }
        };

        return axios.request(config2)
            .then((response) => {
                return {
                    status: "success",
                    data: response.data
                }
            })
            .catch((error) => {
                return {
                    status: "failure",
                    data: error
                }
            });
    } catch (error) {
        return {
            status: "failure",
            data: error
        }
    }
}

module.exports.getOrderMetafields = getOrderMetafields
async function getOrderMetafields(order_id) {
    try {
        let config2 = {
            method: 'get',
            maxBodyLength: Infinity,
            url: `https://${ACTIVE_URL}.myshopify.com/admin/api/2024-07/orders/${order_id}/metafields.json`,
            headers: {
                'X-Shopify-Access-Token': ACTIVE_TOKEN,
                'Content-Type': 'application/json'
            }
        };

        return axios.request(config2)
            .then((response) => {
                return {
                    status: "success",
                    data: response.data
                }
            })
            .catch((error) => {
                return {
                    status: "failure",
                    data: error
                }
            });
    } catch (error) {
        return {
            status: "failure",
            data: error
        }
    }
}