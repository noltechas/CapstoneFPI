import json
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI()

# Load the predictions data
with open('predictions.json') as file:
    predictions_data = json.load(file)

app.mount("/logos", StaticFiles(directory="templates/logos"), name="logos")

@app.get('/predictions/{week}')
async def get_predictions_route(week: str):
    return predictions_data.get(week, [])

@app.get('/')
async def index():
    return FileResponse('templates/index.html')

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8000)