import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import { Configuration, OpenAIApi } from 'openai';
import cors from 'cors';
import BadWords from 'bad-words';
import fetch from 'node-fetch';

const app = express();
app.use(express.json());
app.use(cors());

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);
const filter = new BadWords();

const port = process.env.PORT || 5000;


app.post("/ask", async (req, res) => {
  const prompt = req.body.prompt;

  try {
    if (prompt == null) {
      throw new Error("Uh oh, no prompt was provided");
    }

    const response = await openai.createCompletion({
      model: "text-davinci-003",
      prompt,
      max_tokens: 500,
    });

    const completion = response.data.choices[0].text;
    const filteredCompletion = filter.clean(completion);

    return res.status(200).json({
      success: true,
      message: filteredCompletion,
    });
  } catch (error) {
    console.log(error.message);
  }
});

app.post("/checkAnswer", async (req, res) => {
  const prompt = req.body.prompt;

  try {
    if (prompt == null) {
      throw new Error("Uh oh, no prompt was provided");
    }

    const response = await openai.createCompletion({
      model: "text-davinci-003",
      prompt,
      max_tokens: 500,
    });

    const completion = response.data.choices[0].text;
    const filteredCompletion = filter.clean(completion);

    return res.status(200).json({
      success: true,
      message: filteredCompletion,
    });
  } catch (error) {
    console.log(error.message);
  }
});

app.post("/canvasProxy", async (req, res) => {
  const { apiKey, classCode } = req.body;

  try {
    const canvasResponse = await fetch(
      `https://canvas.instructure.com/api/v1/courses/${classCode}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    );

    const data = await canvasResponse.json();

    if (!canvasResponse.ok) {
      console.error('Canvas API response not OK:', data);
      return res.status(canvasResponse.status).send(data);
    }

    res.status(200).json(data);
  } catch (error) {
    console.error('Error in canvasProxy:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

app.all("/sections", async (req, res) => {
  // Expect the API key and course ID to be provided in the request body or query parameters
  const { apiKey, classCode } = req.method === 'POST' ? req.body : req.query;

  // Validate the input
  if (!apiKey || !classCode) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const canvasDomain = 'https://canvas.instructure.com';
  const url = `${canvasDomain}/api/v1/courses/${classCode}/sections`;

  try {
    const canvasResponse = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!canvasResponse.ok) {
      // If the Canvas API request fails, capture the response for debugging
      const errorResponse = await canvasResponse.text();
      throw new Error(`Canvas API request failed: ${errorResponse}`);
    }

    const sections = await canvasResponse.json();
    res.status(200).json(sections);
  } catch (error) {
    console.error('Error fetching sections:', error);
    res
      .status(500)
      .json({ error: 'Failed to fetch sections', details: error.message });
  }
});

app.post("/announcements", async (req, res) => {
  // Extract the announcement details and credentials from the request body
  const { courseId, title, message, apiKey } = req.body;

  // Check if all required parameters are provided
  if (!courseId || !title || !message || !apiKey) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  // Construct the API URL for Canvas using the provided courseId
  const canvasUrl = `https://canvas.instructure.com/api/v1/courses/${courseId}/discussion_topics`;

  try {
    const canvasResponse = await fetch(canvasUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: title,
        message: message,
        is_announcement: true,
      }),
    });

    if (!canvasResponse.ok) {
      // If the Canvas API request fails, capture the response for debugging
      const errorResponse = await canvasResponse.text();
      throw new Error(`Canvas API request failed: ${errorResponse}`);
    }

    // Respond to the client that the announcement was successful
    res.status(200).json({ message: 'Announcement created' });
  } catch (error) {
    console.error('Error creating announcement:', error);
    res.status(500).json({
      error: 'Failed to create announcement',
      details: error.message,
    });
  }
});

app.all("/students", async (req, res) => {
  // Expect the API key and course ID to be provided in the request body or query parameters
  const { apiKey, courseId, sectionName } =
    req.method === 'POST' ? req.body : req.query;

  // Validate the input
  if (!apiKey || !courseId || !sectionName) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const canvasDomain = 'https://canvas.instructure.com';

  try {
    // Get all sections in the course
    const sectionsUrl = `${canvasDomain}/api/v1/courses/${courseId}/sections`;
    const sectionsResponse = await fetch(sectionsUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!sectionsResponse.ok) {
      throw new Error('Failed to fetch sections');
    }

    const sections = await sectionsResponse.json();
    // Find the section that matches the sectionName
    const section = sections.find((s) => s.name === sectionName);

    if (!section) {
      return res.status(404).json({ error: 'Section not found' });
    }

    // Get the students in that section
    const studentsUrl = `${canvasDomain}/api/v1/sections/${section.id}/enrollments?enrollment_type=student&per_page=100`;
    const studentsResponse = await fetch(studentsUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!studentsResponse.ok) {
      throw new Error('Failed to fetch students for the section');
    }

    const students = await studentsResponse.json();
    // Filter out users who are not students (if necessary)
    const studentEnrollments = students.filter(
      (enrollment) => enrollment.type === 'StudentEnrollment'
    );

    res.status(200).json(studentEnrollments);
  } catch (error) {
    console.error('Error fetching students:', error);
    res
      .status(500)
      .json({ error: 'Failed to fetch students', details: error.message });
  }
});

app.listen(port, () => console.log(`Server is running on port ${port}!!`));
