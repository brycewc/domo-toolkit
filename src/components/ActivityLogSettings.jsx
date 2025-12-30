import { useState, useEffect } from "react";
import { Button, Description, FieldError, Form, Input, Label, TextField } from "@heroui/react";

export default function ActivityLogSettings() {
  const [cardId, setCardId] = useState("");
  const [objectTypeColumnName, setObjectTypeColumnName] = useState("Object_Type");
  const [objectIdColumnName, setObjectIdColumnName] = useState("Object_ID");
  const [saveStatus, setSaveStatus] = useState("");
  
  // Store the initial/synced values for reset functionality
  const [initialCardId, setInitialCardId] = useState("");
  const [initialObjectTypeColumnName, setInitialObjectTypeColumnName] = useState("Object_Type");
  const [initialObjectIdColumnName, setInitialObjectIdColumnName] = useState("Object_ID");

  // Load settings from Chrome storage on component mount
  useEffect(() => {
    chrome.storage.sync.get(
      ["activityLogCardId", "activityLogObjectTypeColumn", "activityLogObjectIdColumn"],
      (result) => {
        const cardIdValue = result.activityLogCardId || "";
        const objectTypeValue = result.activityLogObjectTypeColumn || "Object_Type";
        const objectIdValue = result.activityLogObjectIdColumn || "Object_ID";
        
        setCardId(cardIdValue);
        setObjectTypeColumnName(objectTypeValue);
        setObjectIdColumnName(objectIdValue);
        
        setInitialCardId(cardIdValue);
        setInitialObjectTypeColumnName(objectTypeValue);
        setInitialObjectIdColumnName(objectIdValue);
      }
    );
  }, []);

  const onSubmit = (e) => {
    e.preventDefault();

    // Save to Chrome storage
    chrome.storage.sync.set(
      {
        activityLogCardId: cardId,
        activityLogObjectTypeColumn: objectTypeColumnName,
        activityLogObjectIdColumn: objectIdColumnName,
      },
      () => {
        setSaveStatus("Settings saved successfully!");
        setTimeout(() => setSaveStatus(""), 3000);
      }
    );
  };

  const onReset = () => {
    setCardId(initialCardId);
    setObjectTypeColumnName(initialObjectTypeColumnName);
    setObjectIdColumnName(initialObjectIdColumnName);
  };

  return (
    <Form className="flex w-96 flex-col gap-4 p-4" onSubmit={onSubmit}>
      <TextField
        isRequired
        name="cardId"
        type="text"
        value={cardId}
        onChange={setCardId}
      >
        <Label>Card ID</Label>
        <Input placeholder="Enter card ID" />
        <Description>The Domo card ID for the activity log</Description>
        <FieldError />
      </TextField>
      <TextField
        isRequired
        name="objectIdColumnName"
        type="text"
        value={objectIdColumnName}
        onChange={setObjectIdColumnName}
      >
        <Label>Object ID Column Name</Label>
        <Input placeholder="Enter column name" />
        <Description>The column name that contains the object ID</Description>
        <FieldError />
      </TextField>
      <TextField
        isRequired
        name="objectTypeColumnName"
        type="text"
        value={objectTypeColumnName}
        onChange={setObjectTypeColumnName}
      >
        <Label>Object Type Column Name</Label>
        <Input placeholder="Enter column name" />
        <Description>The column name that contains the object type</Description>
        <FieldError />
      </TextField>

      {saveStatus && (
        <div className="text-green-600 text-sm">{saveStatus}</div>
      )}

      <div className="flex gap-2">
        <Button type="submit">
          Save Settings
        </Button>
        <Button type="button" variant="secondary" onPress={onReset}>
          Reset
        </Button>
      </div>
    </Form>
  );
}