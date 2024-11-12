const fetch = require('node-fetch');

const PIPEDRIVE_API_KEY = process.env.PIPEDRIVE_API_KEY;
const PIPEDRIVE_COMPANY_DOMAIN = process.env.PIPEDRIVE_COMPANY_DOMAIN;

module.exports = async (req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    // Log the incoming webhook data for debugging
    console.log('Received webhook data:', req.body);

    // Extract form data from Webflow's format
    const { data } = req.body;

    if (!data || !data.name || !data.email || !data.contact_number) {
      return res.status(400).json({
        message: 'Missing required fields',
        receivedData: data
      });
    }

    // Create a descriptive lead title
    const pipedriveData = {
      title: `New Patient Inquiry - ${data.name || 'Unknown'}`,
      person_id: null,
      value: {
        amount: 0,
        currency: 'AUD'
      },
      status: 'open',
      label: 'Contact Form'
    };

    // Create person in Pipedrive
    const personResponse = await fetch(
      `https://${PIPEDRIVE_COMPANY_DOMAIN}.pipedrive.com/api/v1/persons`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${PIPEDRIVE_API_KEY}`
        },
        body: JSON.stringify({
          name: data.name,
          email: [{ value: data.email, primary: true }],
          phone: [{ value: data.contact_number, primary: true }]
        })
      }
    );

    const personData = await personResponse.json();
    if (!personResponse.ok) {
      throw new Error(`Failed to create person: ${JSON.stringify(personData)}`);
    }

    pipedriveData.person_id = personData.data.id;

    // Create lead in Pipedrive
    const leadResponse = await fetch(
      `https://${PIPEDRIVE_COMPANY_DOMAIN}.pipedrive.com/api/v1/leads`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${PIPEDRIVE_API_KEY}`
        },
        body: JSON.stringify(pipedriveData)
      }
    );

    const leadData = await leadResponse.json();
    if (!leadResponse.ok) {
      throw new Error(`Failed to create lead: ${JSON.stringify(leadData)}`);
    }

    // Add detailed note with all form information
    const noteContent = `
New Patient Inquiry Details:
--------------------------
Name: ${data.name}
Email: ${data.email}
Contact Number: ${data.contact_number}
Preferred Contact Time: ${data.preferred_contact_time}

Form Submission Details:
----------------------
Submission Time: ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}
Source: Tarneith Health Hub Website Contact Form
    `.trim();

    await fetch(
      `https://${PIPEDRIVE_COMPANY_DOMAIN}.pipedrive.com/api/v1/notes`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${PIPEDRIVE_API_KEY}`
        },
        body: JSON.stringify({
          content: noteContent,
          lead_id: leadData.data.id
        })
      }
    );

    // Return success response
    return res.status(200).json({
      message: 'Successfully created lead in Pipedrive',
      leadId: leadData.data.id
    });

  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({
      message: 'Error processing webhook',
      error: error.message
    });
  }
};