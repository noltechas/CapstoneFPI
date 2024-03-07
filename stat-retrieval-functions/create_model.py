import json, random
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from keras.models import Sequential
from keras.layers import Dense, Dropout

def preprocess_data(games):
    features = []
    labels = []

    # Define maximum numbers for player stats to be considered
    max_players = {
        'QB': 1, 'RBs': 4, 'WRs/TEs': 7, 'Defenders': 12, 'OLs': 5
    }

    for game in games:
        game_features = [
            float(game['Season']),
            float(game['Week']),
        ]

        def add_period_stats(period_stats, max_players):
            team_stats_fields = ['win_percentage', 'strength_of_record', 'points_per_game', 'points_allowed_per_game', 'total_YPG', 'turnovers_per_game', 'penalties_per_game', '3rd_down_eff', 'redzone_eff', 'sacks_per_game', 'interceptions_per_game', 'forced_fumbles_per_game', 'yards_per_play', 'yards_allowed_per_game', 'yards_allowed_per_play', 'FBS_opponent_ratio']
            for field in team_stats_fields:
                game_features.append(float(period_stats.get(field, 0)))

            player_roles = ['QB', 'RBs', 'WRs/TEs', 'Defenders', 'OLs']
            player_stats_fields = ['fumbles_per_game', 'recruiting_score', 'completion_percentage', 'passing_yards_per_game', 'TD_INT_ratio', 'QBR', 'rushing_yards', 'rushing_touchdowns', 'passing_touchdowns', 'tackles_per_game', 'sacks_per_game', 'interceptions_per_game', 'forced_fumbles_per_game', 'passes_defended_per_game', 'rushing_yards_per_game', 'rushing_yards_per_carry', 'rushing_touchdowns_per_game', 'receiving_touchdowns_per_game', 'receptions_per_game', 'receiving_yards_per_game', 'receiving_yards_per_catch']

            for role in player_roles:
                players = period_stats.get(role, [])
                for i in range(max_players[role]):
                    player = players[i] if i < len(players) else {}
                    for field in player_stats_fields:
                        game_features.append(float(player.get(field, 0)))

        for period_stats in game['HomeStats']:
            add_period_stats(period_stats, max_players)
        for period_stats in game['AwayStats']:
            add_period_stats(period_stats, max_players)

        home_points = float(game['HomePoints'])
        away_points = float(game['AwayPoints'])
        home_win_percentage = home_points / (home_points + away_points) if (home_points + away_points) > 0 else 0.5

        features.append(game_features)
        labels.append([home_points, away_points])

    # Convert features and labels to NumPy arrays of type float
    X = np.array(features, dtype=float)
    y = np.array(labels, dtype=float)
    return X, y

# Load and preprocess data
def load_data(filename):
    with open(filename, 'r') as file:
        data = json.load(file)
    return data

def create_model(input_shape):
    model = Sequential([
        Dense(128, activation='relu', input_shape=(input_shape,)),
        Dropout(0.1),
        Dense(64, activation='relu'),
        Dropout(0.1),
        Dense(32, activation='relu'),
        Dense(3, activation='linear')  # Predict HomeScore, AwayScore, and HomeWinPercentage
    ])
    model.compile(optimizer='adam', loss='mse', metrics=['mae'])
    return model

def train_model(X_train, y_train, X_val, y_val):
    model = create_model(X_train.shape[1])
    history = model.fit(X_train, y_train, validation_data=(X_val, y_val), epochs=100, batch_size=10)
    return model, history

def select_random_game(schedule_filename):
    with open(schedule_filename, 'r') as file:
        schedule = json.load(file)
    random_game = random.choice(schedule)  # Adjust according to the structure of your schedule file
    print(random_game)
    return [random_game]  # Wrap it in a list to match the expected input format for preprocess_data

def predict_game_outcome(model, game_data):
    # Assuming game_data is already processed and scaled
    predictions = model.predict(game_data)
    return predictions


# Main function to run the pipeline
def main():
    filename = 'game_stats_for_dnn.json'
    data = load_data(filename)

    # Preprocess data
    X, y = preprocess_data(data)

    # Ensure X is 2D and y is 2D
    print("Shape of X:", X.shape)
    print("Shape of y:", y.shape)

    # Split data into training and validation sets
    X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42)

    # Ensure the input to the model is correct
    print("Shape of X_train:", X_train.shape)
    print("Shape of X_val:", X_val.shape)

    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_val_scaled = scaler.transform(X_val)

    # Train model
    model, history = train_model(X_train_scaled, y_train, X_val_scaled, y_val)

    # Save model for later use
    model.save('game_prediction_model.h5')

    # Select a random game from the schedule
    random_game = select_random_game('game_stats_for_dnn.json')
    random_game_processed, _ = preprocess_data(random_game)  # Labels are not needed for prediction

    # Scale the features of the random game using the same scaler
    # IMPORTANT: You must save the scaler after fitting on your training data and load it here to transform
    random_game_scaled = scaler.transform(random_game_processed)

    # Predict the outcome of the random game
    prediction = predict_game_outcome(model, random_game_scaled)
    print("Prediction (HomePoints, AwayPoints, HomeWinPercentage):", prediction)



if __name__ == '__main__':
    main()
