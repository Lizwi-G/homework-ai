const askButton = document.getElementById("askBtn");
const questionInput = document.getElementById("question");
const gradeSelect = document.getElementById("grade");
const subjectSelect = document.getElementById("subject");
const outputBox = document.getElementById("output");

askButton.addEventListener("click", async () => {
  const question = questionInput.value;
  const grade = gradeSelect.value;
  const subject = subjectSelect.value;

  if (!question || !grade || !subject) {
    alert("Please enter a question, grade and subject");
    return;
  }

  outputBox.innerText = "Thinking... 🤔";

  try {
    const response = await fetch("http://localhost:5000/ask-ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        question,
        grade,
        subject
      })
    });

    const data = await response.json();
    outputBox.innerText = data.explanation;

  } catch (error) {
    outputBox.innerText = "Error connecting to AI server.";
  }
});
