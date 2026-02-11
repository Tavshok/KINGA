"""
Fraud Detection Model Training DAG

This DAG orchestrates the complete training pipeline for the fraud detection model:
1. Retrieve features from SageMaker Feature Store
2. Prepare training/validation/test datasets
3. Train XGBoost model with hyperparameter tuning
4. Validate model performance
5. Register model in MLflow
6. Promote to production if validation passes
7. Deploy to SageMaker endpoint

Author: Tavonga Shoko
Version: 1.0.0
"""

from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.providers.amazon.aws.operators.sagemaker import SageMakerTrainingOperator
from airflow.providers.amazon.aws.sensors.sagemaker import SageMakerTrainingSensor
from airflow.operators.bash import BashOperator
import boto3
import mlflow
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score, precision_recall_curve
import xgboost as xgb
import json

# Default arguments
default_args = {
    'owner': 'kinga-ml-team',
    'depends_on_past': False,
    'email': ['ml-alerts@kinga.com'],
    'email_on_failure': True,
    'email_on_retry': False,
    'retries': 2,
    'retry_delay': timedelta(minutes=5),
}

# DAG definition
dag = DAG(
    'fraud_detection_training_pipeline',
    default_args=default_args,
    description='Train and deploy fraud detection model',
    schedule_interval='0 2 * * 0',  # Weekly on Sunday at 2 AM
    start_date=datetime(2026, 2, 1),
    catchup=False,
    tags=['ml', 'fraud-detection', 'training'],
)

# Configuration
MLFLOW_TRACKING_URI = 'http://mlflow.kinga.internal:5000'
MODEL_NAME = 'fraud-detection'
FEATURE_GROUP_NAME = 'kinga-fraud-features-v1'
S3_BUCKET = 'kinga-ml-training-data'
SAGEMAKER_ROLE = 'arn:aws:iam::123456789012:role/SageMakerExecutionRole'

# Performance thresholds
AUC_ROC_THRESHOLD = 0.90
PRECISION_AT_90_RECALL_THRESHOLD = 0.80

def retrieve_features_from_feature_store(**context):
    """
    Retrieve fraud detection features from SageMaker Feature Store.
    """
    print("Retrieving features from SageMaker Feature Store...")
    
    sagemaker_client = boto3.client('sagemaker-featurestore-runtime')
    athena_client = boto3.client('athena')
    
    # Query Feature Store via Athena
    query = f"""
    SELECT *
    FROM "{FEATURE_GROUP_NAME}"
    WHERE event_time >= TIMESTAMP '2025-01-01 00:00:00'
      AND event_time < TIMESTAMP '2026-02-01 00:00:00'
      AND is_deleted = false
    """
    
    # Execute query
    response = athena_client.start_query_execution(
        QueryString=query,
        QueryExecutionContext={'Database': 'sagemaker_featurestore'},
        ResultConfiguration={'OutputLocation': f's3://{S3_BUCKET}/athena-results/'}
    )
    
    query_execution_id = response['QueryExecutionId']
    
    # Wait for query to complete
    while True:
        query_status = athena_client.get_query_execution(QueryExecutionId=query_execution_id)
        status = query_status['QueryExecution']['Status']['State']
        
        if status in ['SUCCEEDED', 'FAILED', 'CANCELLED']:
            break
        
        time.sleep(5)
    
    if status != 'SUCCEEDED':
        raise Exception(f"Athena query failed with status: {status}")
    
    # Get results
    results = athena_client.get_query_results(QueryExecutionId=query_execution_id)
    
    # Convert to DataFrame
    columns = [col['Label'] for col in results['ResultSet']['ResultSetMetadata']['ColumnInfo']]
    rows = [[field.get('VarCharValue', '') for field in row['Data']] 
            for row in results['ResultSet']['Rows'][1:]]  # Skip header
    
    df = pd.DataFrame(rows, columns=columns)
    
    print(f"Retrieved {len(df)} records from Feature Store")
    
    # Save to S3
    s3_path = f's3://{S3_BUCKET}/fraud-training-data/{datetime.now().strftime("%Y%m%d_%H%M%S")}/features.parquet'
    df.to_parquet(s3_path, index=False)
    
    # Push to XCom
    context['ti'].xcom_push(key='features_s3_path', value=s3_path)
    context['ti'].xcom_push(key='total_records', value=len(df))
    
    return s3_path

def prepare_datasets(**context):
    """
    Prepare train/val/test datasets with proper stratification.
    """
    print("Preparing datasets...")
    
    # Get features path from previous task
    features_s3_path = context['ti'].xcom_pull(key='features_s3_path', task_ids='retrieve_features')
    
    # Load data
    df = pd.read_parquet(features_s3_path)
    
    # Separate features and labels
    feature_columns = [col for col in df.columns if col not in ['claim_id', 'is_fraudulent', 'event_time', 'is_deleted']]
    X = df[feature_columns]
    y = df['is_fraudulent'].astype(int)
    
    print(f"Features shape: {X.shape}")
    print(f"Fraud rate: {y.mean():.2%}")
    
    # Train/val/test split (70/15/15)
    X_train, X_temp, y_train, y_temp = train_test_split(
        X, y, test_size=0.3, stratify=y, random_state=42
    )
    X_val, X_test, y_val, y_test = train_test_split(
        X_temp, y_temp, test_size=0.5, stratify=y_temp, random_state=42
    )
    
    print(f"Train set: {len(X_train)} samples, fraud rate: {y_train.mean():.2%}")
    print(f"Val set: {len(X_val)} samples, fraud rate: {y_val.mean():.2%}")
    print(f"Test set: {len(X_test)} samples, fraud rate: {y_test.mean():.2%}")
    
    # Save datasets to S3
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    base_path = f's3://{S3_BUCKET}/fraud-training-data/{timestamp}'
    
    train_path = f'{base_path}/train.parquet'
    val_path = f'{base_path}/val.parquet'
    test_path = f'{base_path}/test.parquet'
    
    pd.concat([X_train, y_train], axis=1).to_parquet(train_path, index=False)
    pd.concat([X_val, y_val], axis=1).to_parquet(val_path, index=False)
    pd.concat([X_test, y_test], axis=1).to_parquet(test_path, index=False)
    
    # Push to XCom
    context['ti'].xcom_push(key='train_path', value=train_path)
    context['ti'].xcom_push(key='val_path', value=val_path)
    context['ti'].xcom_push(key='test_path', value=test_path)
    context['ti'].xcom_push(key='feature_columns', value=feature_columns)
    
    return {'train': train_path, 'val': val_path, 'test': test_path}

def train_model(**context):
    """
    Train XGBoost fraud detection model.
    """
    print("Training XGBoost model...")
    
    # Get dataset paths
    train_path = context['ti'].xcom_pull(key='train_path', task_ids='prepare_datasets')
    val_path = context['ti'].xcom_pull(key='val_path', task_ids='prepare_datasets')
    
    # Load data
    train_df = pd.read_parquet(train_path)
    val_df = pd.read_parquet(val_path)
    
    X_train = train_df.drop('is_fraudulent', axis=1)
    y_train = train_df['is_fraudulent']
    X_val = val_df.drop('is_fraudulent', axis=1)
    y_val = val_df['is_fraudulent']
    
    # Set up MLflow
    mlflow.set_tracking_uri(MLFLOW_TRACKING_URI)
    mlflow.set_experiment(f'{MODEL_NAME}-training')
    
    # Hyperparameters
    params = {
        'max_depth': 10,
        'learning_rate': 0.1,
        'n_estimators': 500,
        'objective': 'binary:logistic',
        'eval_metric': 'auc',
        'scale_pos_weight': int(1 / y_train.mean()) - 1,  # Balance classes
        'random_state': 42
    }
    
    # Start MLflow run
    with mlflow.start_run(run_name=f'fraud-detection-{datetime.now().strftime("%Y%m%d_%H%M%S")}'):
        # Log parameters
        mlflow.log_params(params)
        mlflow.log_param('train_samples', len(X_train))
        mlflow.log_param('val_samples', len(X_val))
        mlflow.log_param('fraud_rate', y_train.mean())
        
        # Train model
        model = xgb.XGBClassifier(**params)
        model.fit(
            X_train, y_train,
            eval_set=[(X_val, y_val)],
            early_stopping_rounds=50,
            verbose=True
        )
        
        # Validation predictions
        y_val_pred_proba = model.predict_proba(X_val)[:, 1]
        
        # Calculate metrics
        auc_roc = roc_auc_score(y_val, y_val_pred_proba)
        
        precision, recall, thresholds = precision_recall_curve(y_val, y_val_pred_proba)
        idx = np.argmin(np.abs(recall - 0.9))
        precision_at_90_recall = precision[idx]
        
        # Log metrics
        mlflow.log_metric('val_auc_roc', auc_roc)
        mlflow.log_metric('val_precision_at_90_recall', precision_at_90_recall)
        
        # Log model
        mlflow.xgboost.log_model(model, MODEL_NAME)
        
        # Get run ID
        run_id = mlflow.active_run().info.run_id
        
        print(f"Training completed. Run ID: {run_id}")
        print(f"Validation AUC-ROC: {auc_roc:.4f}")
        print(f"Precision @ 90% recall: {precision_at_90_recall:.4f}")
        
        # Push to XCom
        context['ti'].xcom_push(key='run_id', value=run_id)
        context['ti'].xcom_push(key='val_auc_roc', value=auc_roc)
        context['ti'].xcom_push(key='val_precision_at_90_recall', value=precision_at_90_recall)
        
        return run_id

def validate_model(**context):
    """
    Validate model on test set and check if it meets production criteria.
    """
    print("Validating model on test set...")
    
    # Get test data path and run ID
    test_path = context['ti'].xcom_pull(key='test_path', task_ids='prepare_datasets')
    run_id = context['ti'].xcom_pull(key='run_id', task_ids='train_model')
    
    # Load test data
    test_df = pd.read_parquet(test_path)
    X_test = test_df.drop('is_fraudulent', axis=1)
    y_test = test_df['is_fraudulent']
    
    # Load model from MLflow
    mlflow.set_tracking_uri(MLFLOW_TRACKING_URI)
    model_uri = f"runs:/{run_id}/{MODEL_NAME}"
    model = mlflow.xgboost.load_model(model_uri)
    
    # Test predictions
    y_test_pred_proba = model.predict_proba(X_test)[:, 1]
    
    # Calculate metrics
    test_auc_roc = roc_auc_score(y_test, y_test_pred_proba)
    
    precision, recall, thresholds = precision_recall_curve(y_test, y_test_pred_proba)
    idx = np.argmin(np.abs(recall - 0.9))
    test_precision_at_90_recall = precision[idx]
    
    print(f"Test AUC-ROC: {test_auc_roc:.4f}")
    print(f"Test Precision @ 90% recall: {test_precision_at_90_recall:.4f}")
    
    # Log test metrics to MLflow
    with mlflow.start_run(run_id=run_id):
        mlflow.log_metric('test_auc_roc', test_auc_roc)
        mlflow.log_metric('test_precision_at_90_recall', test_precision_at_90_recall)
    
    # Check if model meets production criteria
    validation_passed = (
        test_auc_roc >= AUC_ROC_THRESHOLD and
        test_precision_at_90_recall >= PRECISION_AT_90_RECALL_THRESHOLD
    )
    
    if validation_passed:
        print("✓ Model passed validation criteria")
    else:
        print("✗ Model failed validation criteria")
        print(f"  AUC-ROC: {test_auc_roc:.4f} (threshold: {AUC_ROC_THRESHOLD})")
        print(f"  Precision @ 90% recall: {test_precision_at_90_recall:.4f} (threshold: {PRECISION_AT_90_RECALL_THRESHOLD})")
    
    # Push to XCom
    context['ti'].xcom_push(key='validation_passed', value=validation_passed)
    context['ti'].xcom_push(key='test_auc_roc', value=test_auc_roc)
    context['ti'].xcom_push(key='test_precision_at_90_recall', value=test_precision_at_90_recall)
    
    if not validation_passed:
        raise ValueError("Model failed validation criteria")
    
    return validation_passed

def register_and_promote_model(**context):
    """
    Register model in MLflow registry and promote to production.
    """
    print("Registering model in MLflow registry...")
    
    run_id = context['ti'].xcom_pull(key='run_id', task_ids='train_model')
    validation_passed = context['ti'].xcom_pull(key='validation_passed', task_ids='validate_model')
    
    if not validation_passed:
        raise ValueError("Cannot promote model that failed validation")
    
    mlflow.set_tracking_uri(MLFLOW_TRACKING_URI)
    client = mlflow.tracking.MlflowClient()
    
    # Register model
    model_uri = f"runs:/{run_id}/{MODEL_NAME}"
    result = mlflow.register_model(model_uri=model_uri, name=MODEL_NAME)
    
    version = result.version
    print(f"Model registered as version {version}")
    
    # Promote to production
    client.transition_model_version_stage(
        name=MODEL_NAME,
        version=version,
        stage="Production",
        archive_existing_versions=True
    )
    
    print(f"Model version {version} promoted to Production")
    
    # Add description
    client.update_model_version(
        name=MODEL_NAME,
        version=version,
        description=f"Fraud detection model trained on {datetime.now().strftime('%Y-%m-%d')}"
    )
    
    # Push to XCom
    context['ti'].xcom_push(key='model_version', value=version)
    
    return version

def deploy_to_sagemaker(**context):
    """
    Deploy model to SageMaker endpoint.
    """
    print("Deploying model to SageMaker endpoint...")
    
    model_version = context['ti'].xcom_pull(key='model_version', task_ids='register_and_promote')
    
    # This would typically trigger a separate deployment pipeline
    # For now, we'll just log the deployment request
    
    print(f"Deployment request created for model version {model_version}")
    print("Deployment will be handled by separate SageMaker deployment pipeline")
    
    # In production, this would trigger:
    # 1. Create SageMaker model from MLflow artifact
    # 2. Create endpoint configuration
    # 3. Update or create endpoint
    # 4. Run smoke tests
    # 5. Gradually shift traffic (blue/green deployment)
    
    return f"fraud-detection-v{model_version}"

# Define tasks
retrieve_features_task = PythonOperator(
    task_id='retrieve_features',
    python_callable=retrieve_features_from_feature_store,
    dag=dag,
)

prepare_datasets_task = PythonOperator(
    task_id='prepare_datasets',
    python_callable=prepare_datasets,
    dag=dag,
)

train_model_task = PythonOperator(
    task_id='train_model',
    python_callable=train_model,
    dag=dag,
)

validate_model_task = PythonOperator(
    task_id='validate_model',
    python_callable=validate_model,
    dag=dag,
)

register_and_promote_task = PythonOperator(
    task_id='register_and_promote',
    python_callable=register_and_promote_model,
    dag=dag,
)

deploy_task = PythonOperator(
    task_id='deploy_to_sagemaker',
    python_callable=deploy_to_sagemaker,
    dag=dag,
)

send_success_notification = BashOperator(
    task_id='send_success_notification',
    bash_command='echo "Fraud detection model training completed successfully" | mail -s "ML Training Success" ml-alerts@kinga.com',
    dag=dag,
)

# Define task dependencies
retrieve_features_task >> prepare_datasets_task >> train_model_task >> validate_model_task >> register_and_promote_task >> deploy_task >> send_success_notification
