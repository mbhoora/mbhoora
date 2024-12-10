// import 'dotenv/config'
require('dotenv').config()
// import express from 'express';
const express = require('express')
// import axios from 'axios';
const axios = require('axios')
// import cors from 'cors'
const cors = require('cors')

const fs = require('fs')
const https = require('https')

const app = express();

let accessToken = ''; // Placeholder for storing access token
let tokenExpiry = null; // Optional placeholder to track token expiry (if provided)

// Middleware to parse JSON bodies
app.use(express.json({ limit: '50mb' }));
app.use(cors({
    origin: '*'
  }));


app.use(function(req,res,next){
    console.log("Entering Request ###",req)
    next()
})

app.use(function(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});

app.use('/voucher_create',require('./vouchercreate'))
app.use('/voucher-delete',require('./voucherdelete'))

// Root endpoint for server status checking
app.get('/', (req, res) => {
    res.send('Server is running. Use the correct endpoint path for your requests.');
});

app.post('/test',(req,res)=>{
    res.send({
        status:"true",
        data:req.body
    })
})

// Function to fetch and store the access token
const fetchAccessToken = async () => {
    try {
        const response = await axios.post('https://app-customization-6181--uat.sandbox.lightning.force.com/services/oauth2/token', null, {
            params: {
                grant_type: 'client_credentials',
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET
            },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        accessToken = response.data.access_token;
        tokenExpiry = Date.now() + (response.data.expires_in || 3600) * 1000; // Optional: store expiry if provided
        console.log('Access Token Retrieved:', accessToken);
    } catch (error) {
        console.error('Error fetching access token:', error.response ? error.response.data : error.message);
        throw new Error('Failed to fetch access token');
    }
};


const SHOPIFY_STORE = 'monte-carlo-apps.myshopify.com';
const ACCESS_TOKEN = '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';
// Function to check price and compare at price for products, and add result to order note attributes

app.use(express.json());


// POST endpoint to update Shopify order with compare price logic
app.post('/shopify/compare-price-order', async (req, res) => {
    const orderData = req.body;

    // Validate required fields in the request body
    if (!orderData.id || !orderData.line_items) {
        return res.status(400).send('Invalid request: Order ID and line_items are required');
    }

    let noteAttributes = [];

    try {
        for (const lineItem of orderData.line_items) {
            const productId = lineItem.product_id;
            let hasComparePriceProduct = 'false';

            try {
                // Fetch product details from Shopify API
                const productResponse = await axios.get(
                    `https://${SHOPIFY_STORE}/admin/api/2023-01/products/${productId}.json`,
                    {
                        headers: {
                            'X-Shopify-Access-Token': ACCESS_TOKEN,
                            'Content-Type': 'application/json',
                        },
                    }
                );

                const productData = productResponse.data.product;

                // Compare price logic: check if any variant has a non-zero compare price greater than the actual price
                hasComparePriceProduct = productData.variants.some((variant) => {
                    const price = parseFloat(variant.price || 0);
                    const compareAtPrice = parseFloat(variant.compare_at_price || 0);
                    return compareAtPrice > 0 && compareAtPrice !== price;
                })
                    ? 'true'
                    : 'false';
            } catch (error) {
                console.error(`Error fetching product ${productId}:`, error.response ? error.response.data : error.message);
                continue; // Skip this line item if product fetch fails
            }

            // Construct note attributes for the order
            noteAttributes.push({
                name: `line_item_${lineItem.id}_has_compare_price_${hasComparePriceProduct}`,
                value: hasComparePriceProduct,
            });
        }

        // Update the order in Shopify with the constructed note attributes
        const requestBody = {
            order: {
                id: orderData.id,
                note_attributes: noteAttributes,
            },
        };

        const updateResponse = await axios.put(
            `https://${SHOPIFY_STORE}/admin/api/2023-01/orders/${orderData.id}.json`,
            requestBody,
            {
                headers: {
                    'X-Shopify-Access-Token': ACCESS_TOKEN,
                    'Content-Type': 'application/json',
                },
            }
        );

        console.log(`Order ${orderData.id} updated successfully.`);
        res.json(updateResponse.data);
    } catch (error) {
        console.error('Error updating Shopify order:', error.response ? error.response.data : error.message);
        handleApiError(res, error);
    }
});


app.post('/shopify/order-update', async (req, res) => {
    console.log("Shopify Order Update API Triggered");
    if (!accessToken || (tokenExpiry && Date.now() >= tokenExpiry)) {
        try {
            await fetchAccessToken();
        } catch (error) {
            return res.status(500).send('Unable to fetch access token');
        }
    }
 
    const orderData = req.body;
 
    // Validate required fields in the request body
    if (!orderData.id || !orderData.fulfillments) {
        return res.status(400).send('Invalid request: Order ID and fulfillments are required');
    }
 
    try {
        // Step 1: Fetch existing note attributes from the order
        const existingOrderResponse = await axios.get(
            `https://${SHOPIFY_STORE}/admin/api/2023-01/orders/${orderData.id}.json`,
            {
                headers: {
                    'X-Shopify-Access-Token': ACCESS_TOKEN,
                    'Content-Type': 'application/json',
                },
            }
        );
 
        const existingOrder = existingOrderResponse.data.order;
        const existingNoteAttributes = existingOrder.note_attributes || [];
 
        let updatedNoteAttributes = [...existingNoteAttributes];
 
        // Step 2: Build new note attributes from shipment data
        for (const fulfillment of orderData.fulfillments) {
            const shipmentStatus = fulfillment.shipment_status || '';
 
            for (const lineItem of fulfillment.line_items) {
                const noteName = `line_item_${lineItem.id}_shipment_status_${shipmentStatus}`;
                const existingAttributeIndex = updatedNoteAttributes.findIndex(
                    (attr) => attr.name === noteName
                );
 
                if (existingAttributeIndex !== -1) {
                    // Update existing attribute
                    updatedNoteAttributes[existingAttributeIndex].value = shipmentStatus;
                } else {
                    // Add new attribute
                    updatedNoteAttributes.push({
                        name: noteName,
                        value: shipmentStatus,
                    });
                }
            }
        }
 
        // Step 3: Update the order with merged note attributes
        const requestBody = {
            order: {
                id: orderData.id,
                note_attributes: updatedNoteAttributes,
            },
        };
 
        const updateResponse = await axios.put(
            `https://${SHOPIFY_STORE}/admin/api/2023-01/orders/${orderData.id}.json`,
            requestBody,
            {
                headers: {
                    'X-Shopify-Access-Token': ACCESS_TOKEN,
                    'Content-Type': 'application/json',
                },
            }
        );
 
        console.log(`Order ${orderData.id} updated successfully.`);
 
        // Step 4: Call Salesforce API
try {
    const salesforceResponse = await axios.post(
        'https://app-customization-6181--uat.sandbox.my.salesforce.com/services/apexrest/UpdateOrderStatusShopifyApi',
        requestBody, // Send the exact requestBody
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        }
    );
 
    console.log('Salesforce API response:', salesforceResponse.data);
} catch (sfError) {
    console.error('Error calling Salesforce API:', sfError.response ? sfError.response.data : sfError.message);
    return res.status(500).send('An error occurred while calling Salesforce API');
}
 
 
        res.json(updateResponse.data);
    } catch (error) {
        console.error('Error updating Shopify order:', error.response ? error.response.data : error.message);
        res.status(500).send('An error occurred while updating the order');
    }
});


// POST endpoint for LoyaltyMemberHistoryApi
app.post('/loyalty-member-history', async (req, res) => {
    if (!accessToken || (tokenExpiry && Date.now() >= tokenExpiry)) {
        try {
            await fetchAccessToken();
        } catch (error) {
            return res.status(500).send('Unable to fetch access token');
        }
    }

    const { email, phone } = req.body;

    const requestBody = {
        email: email || '',
        phone: phone || ''
    };

    try {
        const response = await axios.post('https://app-customization-6181--uat.sandbox.my.salesforce.com/services/apexrest/LoyaltyMemberHistoryApi', requestBody, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        res.json(response.data);
    } catch (error) {
        handleApiError(res, error);
    }
});

// // GET endpoint for LoyaltyMemberHistoryApi using query parameters
// app.get('/loyalty-member-history', async (req, res) => {
//     if (!accessToken || (tokenExpiry && Date.now() >= tokenExpiry)) {
//         try {
//             await fetchAccessToken();
//         } catch (error) {
//             return res.status(500).send('Unable to fetch access token');
//         }
//     }

//     const requestBody = {
//         email: req.query.email || '',
//         phone: req.query.phone || ''
//     };

//     try {
//         const response = await axios.post('https://app-customization-6181--uat.sandbox.my.salesforce.com/services/apexrest/LoyaltyMemberHistoryApi', requestBody, {
//             headers: {
//                 Authorization: `Bearer ${accessToken}`,
//                 'Content-Type': 'application/json'
//             }
//         });

//         res.json(response.data);
//     } catch (error) {
//         handleApiError(res, error);
//     }
// });

// app.post('/voucher_create', async (req, res) => {
//     const { customer_id, points, metafield } = req.body;
  
//     // Validate required fields
//     if (!customer_id || !points || !metafield) {
//       return res.status(400).json({ status: false, message: "Missing required fields" });
//     }
  
//     // Validate metafield structure
//     if (
//       !metafield.namespace ||
//       !metafield.key ||
//       !metafield.value ||
//       !metafield.type
//     ) {
//       return res.status(400).json({ status: false, message: "Invalid metafield structure" });
//     }
  
//     try {
//       // Shopify Admin API request
//       const response = await axios.post(
//         `https://${ACTIVE_URL}.myshopify.com/admin/api/2024-07/customers/${customer_id}/metafields.json`,
//         { metafield },
//         {
//           headers: {
//             'X-Shopify-Access-Token': ACTIVE_TOKEN,
//             'Content-Type': 'application/json',
//           },
//         }
//       );
  
//       // Parse discount code from metafield value
//       let discountCode = null;
//       try {
//         const parsedValue = JSON.parse(metafield.value);
//         discountCode = parsedValue.discount_code;
//       } catch (parseError) {
//         console.error("Error parsing metafield value:", parseError.message || parseError);
//         return res.status(500).json({ status: false, message: "Failed to parse metafield value" });
//       }
  
//       // Respond with success
//       res.json({ status: "success", data: { discount_code: discountCode } });
//     } catch (error) {
//       // Improved error logging
//       console.error("Error in /voucher_create:", {
//         message: error.message,
//         response: error.response ? error.response.data : "No response data",
//       });
  
//       res.status(500).json({
//         status: false,
//         message: "Internal Server Error",
//         error: error.message,
//       });
//     }
//   });
  
  

// POST endpoint to fetch loyalty data
app.post('/fetch-loyalty-data', async (req, res) => {
    if (!accessToken || (tokenExpiry && Date.now() >= tokenExpiry)) {
        try {
            await fetchAccessToken();
        } catch (error) {
            return res.status(500).send('Unable to fetch access token');
        }
    }

    const requestBody = {
        email: req.body.email || '',
        phone: req.body.phone || ''
    };

    try {
        const response = await axios.post('https://app-customization-6181--uat.sandbox.my.salesforce.com/services/apexrest/FetchMemberTierAndPointsApi', requestBody, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        res.json(response.data);
    } catch (error) {
        handleApiError(res, error);
    }
});

// GET endpoint to fetch loyalty data using query parameters
// app.get('/fetch-loyalty-data', async (req, res) => {
//     if (!accessToken || (tokenExpiry && Date.now() >= tokenExpiry)) {
//         try {
//             await fetchAccessToken();
//         } catch (error) {
//             return res.status(500).send('Unable to fetch access token');
//         }
//     }

//     const requestBody = {
//         email: req.query.email || '',
//         phone: req.query.phone || ''
//     };

//     try {
//         const response = await axios.post('https://app-customization-6181--uat.sandbox.my.salesforce.com/services/apexrest/FetchMemberTierAndPointsApi', requestBody, {
//             headers: {
//                 Authorization: `Bearer ${accessToken}`,
//                 'Content-Type': 'application/json'
//             }
//         });

//         res.json(response.data);
//     } catch (error) {
//         handleApiError(res, error);
//     }
// });
// POST endpoint to place an order with NewOrderPlacementShopifyApi


  
app.post('/new-order-placement', async (req, res) => {
    // Check if access token is valid or expired
    console.log ("API trrigged")
    if (!accessToken || (tokenExpiry && Date.now() >= tokenExpiry)) {
        try {
            await fetchAccessToken(); // Fetch a new access token if needed
        } catch (error) {
            return res.status(500).send('Unable to fetch access token');
        }
    }

    try {

        const requestBody = {
            "order" : req.body
        }
        console.log ({
            "order": req.body },"HAS REQUEST BODY")
        // Make the API request to Salesforce
        const response = await axios.post(
            'https://app-customization-6181--uat.sandbox.my.salesforce.com/services/apexrest/NewOrderPlacementShopifyApi/',
            requestBody ,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/json'
                }
            }
        );
        console.log (response.data, "Get Response")
        // Send the response data back to the client
        res.json(response.data);
    } catch (error) {
        // Handle API error
        console.log (error, "error")
        handleApiError(res, error);
    }
});

app.post('/order-cancellation', async (req, res) => {
    // Check if access token is valid or expired
    console.log("Order Cancellation API triggered");
    if (!accessToken || (tokenExpiry && Date.now() >= tokenExpiry)) {
        try {
            await fetchAccessToken(); // Fetch a new access token if needed
        } catch (error) {
            return res.status(500).send('Unable to fetch access token');
        }
    }

    try {
        // Validate that 'cancelled_at' is present in the request body
        if (!req.body.cancelled_at) {
            return res.status(400).send({ error: "Missing 'cancelled_at' parameter in the request body." });
        }

        const requestBody = {
            "order": req.body
        };

        console.log({
            "order": req.body
        }, "HAS REQUEST BODY");

        // Make the API request to Salesforce
        const response = await axios.post(
            'https://app-customization-6181--uat.sandbox.my.salesforce.com/services/apexrest/OrderCancelShopifyApi/',
            requestBody,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/json'
                }
            }
        );

        console.log(response.data, "Get Response");
        // Send the response data back to the client
        res.json(response.data);
    } catch (error) {
        // Handle API error
        console.log(error, "error");
        handleApiError(res, error);
    }
});

app.get('/new-order-placement', async (req, res) => {
    // Check if access token is valid or expired
    if (!accessToken || (tokenExpiry && Date.now() >= tokenExpiry)) {
        try {
            await fetchAccessToken(); // Fetch a new access token if needed
        } catch (error) {
            return res.status(500).send('Unable to fetch access token');
        }
    }

    try {
        // Retrieve data from Salesforce
        const response = await axios.get(
            'https://app-customization-6181--uat.sandbox.my.salesforce.com/services/apexrest/NewOrderPlacementShopifyApi/',
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/json'
                }
            }
        );

        // Send the fetched data back to the client
        res.json(response.data);
    } catch (error) {
        // Handle API error
        handleApiError(res, error);
    }
});

// POST endpoint to block redeem points
app.post('/block-redeem-points', async (req, res) => {
    // Check if access token is valid or expired
    if (!accessToken || (tokenExpiry && Date.now() >= tokenExpiry)) {
        try {
            await fetchAccessToken();
        } catch (error) {
            return res.status(500).send('Unable to fetch access token');
        }
    }

    // Extract fields from the request body
    const { source, email, phone, blockPoints, uniqueCode } = req.body;

    // Construct the request body for the API call
    const requestBody = {
        source: source || 'Shopify', // Default to Shopify if not provided
        email: email || '', // Customer email
        phone: phone || '', // Customer phone
        blockPoints: blockPoints || '', // Points to be blocked
        uniqueCode: uniqueCode || '' // Unique code for the request
    };

    try {
        // Make the API call to block redeem points
        const response = await axios.post(
            'https://app-customization-6181--uat.sandbox.my.salesforce.com/services/apexrest/BlockRedeemPointApi',
            requestBody,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`, // Include the Bearer token
                    'Content-Type': 'application/json'
                }
            }
        );

        // Return the API response to the client
        res.json(response.data);
    } catch (error) {
        // Handle API errors
        handleApiError(res, error);
    }
});


// GET endpoint to block redeem points using query parameters
// app.get('/block-redeem-points', async (req, res) => {
//     if (!accessToken || (tokenExpiry && Date.now() >= tokenExpiry)) {
//         try {
//             await fetchAccessToken();
//         } catch (error) {
//             return res.status(500).send('Unable to fetch access token');
//         }
//     }

//     const requestBody = {
//         customerId: req.query.customerId || '',
//         blockRedeemPoints: req.query.blockRedeemPoints || '',
//         voucherCode: req.query.voucherCode || ''
//     };

//     try {
//         const response = await axios.post('https://app-customization-6181--uat.sandbox.my.salesforce.com/services/apexrest/BlockRedeemPointApi', requestBody, {
//             headers: {
//                 Authorization: `Bearer ${accessToken}`,
//                 'Content-Type': 'application/json'
//             }
//         });

//         res.json(response.data);
//     } catch (error) {
//         handleApiError(res, error);
//     }
// });

// POST endpoint to create a member
app.post('/create-member', async (req, res) => {
    console.log("Create Customer API Triggered");

    // Ensure the access token is valid
    if (!accessToken || (tokenExpiry && Date.now() >= tokenExpiry)) {
        try {
            await fetchAccessToken();
        } catch (error) {
            return res.status(500).send('Unable to fetch access token');
        }
    }

    try {
        const requestBodyy = {
            "customer" : req.body
        }
        // Make the API call directly with req.body
        const response = await axios.post(
            'https://app-customization-6181--uat.sandbox.my.salesforce.com/services/apexrest/CreateMemberApi',
            requestBodyy,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        // Send the response back to the client
        res.json(response.data);
    } catch (error) {
        handleApiError(res, error);
    }
});


// GET endpoint for testing create member using query parameters
// app.get('/create-member', async (req, res) => {
//     if (!accessToken || (tokenExpiry && Date.now() >= tokenExpiry)) {
//         try {
//             await fetchAccessToken();
//         } catch (error) {
//             return res.status(500).send('Unable to fetch access token');
//         }
//     }

//     // Extract query parameters for testing the endpoint using GET requests
//     const requestBody = {
//         customer: {
//             id: req.query.id || '',
//             email: req.query.email || '',
//             first_name: req.query.first_name || '',
//             last_name: req.query.last_name || '',
//             tags: req.query.tags || '',
//             note: req.query.note || '',
//             customer_dob: req.query.customer_dob || '',
//             customer_doa: req.query.customer_doa || '',
//             created_at: req.query.created_at || '',
//             customer_gender: req.query.customer_gender || '',
//             gst_number: req.query.gst_number || '',
//             accountSource: '',
//             sap_code: req.query.sap_code || '',
//             trade_name: req.query.trade_name || '',
//             age: req.query.age || '',
//             default_address: {
//                 address1: req.query.address1 || '',
//                 city: req.query.city || '',
//                 province: req.query.province || '',
//                 country: req.query.country || '',
//                 zip: req.query.zip || '',
//                 phone: req.query.phone || ''
//             }
//         }
//     };

//     try {
//         const response = await axios.post('https://app-customization-6181--uat.sandbox.my.salesforce.com/services/apexrest/CreateMemberApi', requestBody, {
//             headers: {
//                 Authorization: `Bearer ${accessToken}`,
//                 'Content-Type': 'application/json'
//             }
//         });

//         res.json(response.data);
//     } catch (error) {
//         handleApiError(res, error);
//     }
// });

// POST endpoint to clear block points
app.post('/clear-block-points', async (req, res) => {
    // Check if the access token is valid or expired
    if (!accessToken || (tokenExpiry && Date.now() >= tokenExpiry)) {
        try {
            await fetchAccessToken();
        } catch (error) {
            return res.status(500).send('Unable to fetch access token');
        }
    }

    // Extract uniqueCodes from the request body
    const { uniqueCodes } = req.body;

    // Validate that uniqueCodes is a non-empty array
    if (!Array.isArray(uniqueCodes) || uniqueCodes.length === 0) {
        return res.status(400).send('Invalid request: uniqueCodes must be a non-empty array');
    }

    // Construct the request body for the API call
    const requestBody = {
        uniqueCodes,
    };

    try {
        // Make the API call to clear block points
        const response = await axios.post(
            'https://app-customization-6181--uat.sandbox.my.salesforce.com/services/apexrest/ClearBlockPointShopifyApi',
            requestBody,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        // Return the API response to the client
        res.json(response.data);
    } catch (error) {
        // Handle API errors
        handleApiError(res, error);
    }
});


// GET endpoint for testing clear block points using query parameters
// app.get('/clear-block-points', async (req, res) => {
//     if (!accessToken || (tokenExpiry && Date.now() >= tokenExpiry)) {
//         try {
//             await fetchAccessToken();
//         } catch (error) {
//             return res.status(500).send('Unable to fetch access token');
//         }
//     }

//     const voucherCodes = req.query.voucherCodes ? req.query.voucherCodes.split(',') : [];

//     if (voucherCodes.length === 0) {
//         return res.status(400).send('Invalid request: voucherCodes must be a non-empty array');
//     }

//     const requestBody = {
//         voucherCodes
//     };

//     try {
//         const response = await axios.post('https://app-customization-6181--uat.sandbox.my.salesforce.com/services/apexrest/ClearBlockPointApi', requestBody, {
//             headers: {
//                 Authorization: `Bearer ${accessToken}`,
//                 'Content-Type': 'application/json'
//             }
//         });

//         res.json(response.data);
//     } catch (error) {
//         handleApiError(res, error);
//     }
// });




// Function to handle API errors
const handleApiError = (res, error) => {
    if (error.response) {
        console.error('Response Error Data:', error.response.data);
        res.status(error.response.status).send({
            data: error.response.data
        });
    } else if (error.request) {
        console.error('No Response Received:', error.request);
        res.status(500).send('No response received from the API');
    } else {
        console.error('Error', error.message);
        res.status(500).send(error.message);
    }
};




// HTTPS server configuration
const options = {
    key: fs.readFileSync('server.key'), // Replace with your SSL key
    cert: fs.readFileSync('server.cert'), // Replace with your SSL certificate
  };
  
  const PORT = process.env.PORT;
  const server = https.createServer(options, app);
  
  server.listen(PORT, () => {
    console.log(`Server running on https://localhost:${PORT}`);
  });