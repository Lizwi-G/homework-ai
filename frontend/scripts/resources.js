const gradeSelect = document.getElementById("gradeSelect");
const subjectsDiv = document.getElementById("subjects");

let resourcesData = {};

fetch("http://localhost:3000/resources")
  .then(res => res.json())
  .then(data => {
    resourcesData = data;
    Object.keys(data).forEach(grade => {
      const option = document.createElement("option");
      option.value = grade;
      option.textContent = grade;
      gradeSelect.appendChild(option);
    });
  });

gradeSelect.addEventListener("change", () => {
  subjectsDiv.innerHTML = "";
  const grade = gradeSelect.value;
  if (!grade) return;

  const subjects = resourcesData[grade];
  for (let subject in subjects) {
    const div = document.createElement("div");
    div.className = "subject";
    div.innerHTML = `
      <h3>${subject}</h3>
      <ul>
        ${subjects[subject].map(topic => `<li>${topic}</li>`).join("")}
      </ul>
    `;
    subjectsDiv.appendChild(div);
  }
});
